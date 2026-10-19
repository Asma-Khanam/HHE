// Shared bits for the Stripe functions. No Stripe library on purpose: the
// calls we need are a handful of plain HTTPS requests, and fewer packages
// means less to keep up to date on a function that touches money.

export const SB = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
export const SERVICE_KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function sb(path, init = {}) {
  const res = await fetch(`${SB()}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY(),
      Authorization: `Bearer ${SERVICE_KEY()}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.message || `Supabase ${res.status}`);
  return data;
}

// Call a database function as the server.
export const rpc = (name, args) => sb(`rpc/${name}`, { method: "POST", body: JSON.stringify(args) });

// Who is calling? Checked with the consultant's own session, then looked up in staff.
export async function staffFor(token) {
  const anon = process.env.VITE_SUPABASE_ANON_KEY;
  if (!token || !anon) return null;
  const who = await fetch(`${SB()}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } });
  if (!who.ok) return null;
  const user = await who.json();
  const rows = await sb(`staff?user_id=eq.${user.id}&select=user_id,full_name,email`);
  return rows[0] ? { ...rows[0], email: rows[0].email || user.email } : null;
}

// Stripe wants form encoding, with nested keys like metadata[record_id].
function flatten(obj, prefix, out) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") flatten(v, key, out);
    else out.push([key, String(v)]);
  }
  return out;
}

export async function stripe(method, path, params = {}, idempotencyKey) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw Object.assign(new Error("Stripe isn't set up yet (STRIPE_SECRET_KEY is missing on Vercel)."), { status: 503 });
  const body = new URLSearchParams(flatten(params, "", []));
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: method === "GET" ? undefined : body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Stripe ${res.status}`);
  return data;
}

// Money: Stripe counts in the smallest unit (fils for AED), as whole numbers.
export const toMinor = (amount) => Math.round(Number(amount) * 100);
