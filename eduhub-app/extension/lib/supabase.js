import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../config.js";

// A hand-rolled Supabase client, deliberately.
//
// Manifest V3 forbids loading remote scripts, so the official SDK would mean
// vendoring a bundle or adding a build step to what is otherwise a folder of
// plain files you can load unpacked and edit. Everything this extension needs
// is a handful of REST calls, so it does them with fetch and stays
// dependency-free — no npm install, no bundler, no lockfile to keep in step
// with two other apps.
//
// The session lives in chrome.storage.local rather than localStorage: a side
// panel and a service worker don't share a page, and storage is the only thing
// both can read.

const SESSION_KEY = "hh_session";

async function getStoredSession() {
  const { [SESSION_KEY]: session } = await chrome.storage.local.get(SESSION_KEY);
  return session || null;
}

async function storeSession(session) {
  await chrome.storage.local.set({ [SESSION_KEY]: session });
}

export async function clearSession() {
  await chrome.storage.local.remove(SESSION_KEY);
}

function sessionFrom(payload) {
  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    // Supabase returns a lifetime in seconds; an absolute moment is what's
    // actually useful later, and the panel may sit open for hours.
    expires_at: Date.now() + (payload.expires_in || 3600) * 1000,
    user: payload.user || null,
  };
}

export async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.error_description || payload.msg || "Couldn't sign in.");
  const session = sessionFrom(payload);
  await storeSession(session);
  return session;
}

async function refresh(session) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  const payload = await res.json();
  if (!res.ok) throw new Error("Session expired — sign in again.");
  const next = sessionFrom(payload);
  await storeSession(next);
  return next;
}

// Every call goes through here, so a token that lapsed while the panel sat
// open refreshes itself instead of surfacing as a baffling 401 mid-upload.
async function authed() {
  let session = await getStoredSession();
  if (!session) throw new Error("Not signed in.");
  if (Date.now() > session.expires_at - 60000) session = await refresh(session);
  return session;
}

export async function currentSession() {
  const session = await getStoredSession();
  if (!session) return null;
  try {
    return await authed();
  } catch {
    await clearSession();
    return null;
  }
}

async function rest(path) {
  const session = await authed();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

// Being staff is a row in public.staff and nothing else — the same gate the
// founders' portal uses. Checked here so an ordinary family login gets a clear
// "this isn't a staff account" rather than empty lists it can't explain.
export async function isStaff() {
  const rows = await rest("staff?select=user_id&limit=1");
  return Array.isArray(rows) && rows.length > 0;
}

export async function loadCaseload() {
  const [families, parents, children] = await Promise.all([
    rest("families?select=id,intake_status,created_at&order=created_at.desc"),
    rest("parents?select=id,family_id,full_name,relationship,user_id"),
    rest("children?select=id,family_id,full_name,first_name,preferred_name,last_name,year_group_applying_for"),
  ]);
  return { families, parents, children };
}

export async function loadDocuments(ownerType, ownerId) {
  return rest(
    "documents?select=id,document_type,file_url,original_filename,file_type,created_at" +
      "&owner_type=eq." + encodeURIComponent(ownerType) +
      "&owner_id=eq." + encodeURIComponent(ownerId)
  );
}

// The bucket is private, so a file needs a short-lived signed URL. Five
// minutes is plenty — it's fetched immediately and never stored anywhere.
export async function signedUrlFor(path) {
  const session = await authed();
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/documents/${path}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn: 300 }),
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.message || "Couldn't get a link to that file.");
  return `${SUPABASE_URL}/storage/v1${payload.signedURL}`;
}
