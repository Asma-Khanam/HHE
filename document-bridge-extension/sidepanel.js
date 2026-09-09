import { signIn, currentSession, clearSession, isStaff, loadCaseload, loadDocuments, signedUrlFor } from "./lib/supabase.js";
import { attachFileToPage } from "./lib/attach.js";
import { CHILD_DOCUMENT_TYPES, PARENT_DOCUMENT_TYPES } from "./lib/documentTypes.js";

const $ = (id) => document.getElementById(id);
const views = ["view-login", "view-families", "view-docs"];

function show(view) {
  views.forEach((v) => ($(v).hidden = v !== view));
  $("loading").hidden = true;
}

function setError(message) {
  $("error").hidden = !message;
  $("error").textContent = message || "";
  if (message) $("notice").hidden = true;
}

function setNotice(message) {
  $("notice").hidden = !message;
  $("notice").textContent = message || "";
  if (message) $("error").hidden = true;
}

// ---------------------------------------------------------------- naming
// Kept in step with the two web apps by hand: same fallback order the client
// form and the consultant desk both use, so a child is called the same thing
// in all three places.
function childName(child) {
  return (child.preferred_name || child.first_name || child.full_name || "Child").trim();
}

function familyLabel(family, parents, children) {
  const holder = parents.find((p) => p.family_id === family.id && p.user_id) ||
    parents.find((p) => p.family_id === family.id && p.full_name);
  const kids = children.filter((c) => c.family_id === family.id);
  const surname = (kids.map((c) => (c.last_name || "").trim()).find(Boolean)) || "";
  const name = surname ? `The ${surname} family` : holder?.full_name || "Unnamed family";
  return { name, holder, kids };
}

function docLabel(ownerType, documentType) {
  const list = ownerType === "parent" ? PARENT_DOCUMENT_TYPES : CHILD_DOCUMENT_TYPES;
  return list.find((d) => d.key === documentType)?.label || documentType;
}

// ---------------------------------------------------------------- state
let caseload = { families: [], parents: [], children: [] };
let activeFamily = null;

// ---------------------------------------------------------------- startup
async function boot() {
  try {
    const session = await currentSession();
    if (!session) return show("view-login");
    await afterLogin();
  } catch (err) {
    setError(err.message);
    show("view-login");
  }
}

async function afterLogin() {
  $("loading").hidden = false;
  // A family login would technically authenticate but see nothing, which
  // would look like a broken extension rather than the wrong account.
  const staff = await isStaff();
  if (!staff) {
    await clearSession();
    setError("That account isn't set up as staff. Ask whoever manages Supabase to add you.");
    return show("view-login");
  }
  $("signout").hidden = false;
  caseload = await loadCaseload();
  renderFamilies("");
  show("view-families");
}

// ---------------------------------------------------------------- families
function renderFamilies(query) {
  const q = query.trim().toLowerCase();
  const list = $("family-list");
  list.innerHTML = "";

  const rows = caseload.families
    .map((family) => ({ family, ...familyLabel(family, caseload.parents, caseload.children) }))
    .filter((row) => {
      if (!q) return true;
      const haystack = [row.name, row.holder?.full_name || "", ...row.kids.map(childName)].join(" ").toLowerCase();
      return haystack.includes(q);
    });

  rows.forEach((row) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.innerHTML = "";
    const name = document.createElement("span");
    name.className = "list-name";
    name.textContent = row.name;
    const sub = document.createElement("span");
    sub.className = "list-sub";
    sub.textContent = row.kids.length
      ? row.kids.map(childName).join(", ")
      : "No children added yet";
    btn.append(name, sub);
    btn.addEventListener("click", () => openFamily(row));
    li.appendChild(btn);
    list.appendChild(li);
  });

  $("families-empty").hidden = rows.length > 0;
}

// ---------------------------------------------------------------- documents
async function openFamily(row) {
  activeFamily = row;
  $("family-name").textContent = row.name;
  $("doc-groups").innerHTML = "";
  show("view-docs");
  setError("");
  setNotice("");

  const people = [
    ...caseload.parents
      .filter((p) => p.family_id === row.family.id && p.full_name)
      .map((p) => ({ ownerType: "parent", id: p.id, name: p.full_name, tag: p.relationship })),
    ...row.kids.map((c) => ({
      ownerType: "child",
      id: c.id,
      name: childName(c),
      tag: c.year_group_applying_for || "Child",
    })),
  ];

  for (const person of people) {
    const group = document.createElement("div");
    group.className = "group";
    const head = document.createElement("div");
    head.className = "group-head";
    head.textContent = `${person.name} · ${person.tag}`;
    group.appendChild(head);

    let docs = [];
    try {
      docs = await loadDocuments(person.ownerType, person.id);
    } catch (err) {
      setError(err.message);
    }

    // A profile photo is not paperwork and has no business in a school
    // application, so it never appears here — same rule the other two apps use.
    docs = docs.filter((d) => d.document_type !== "profile_photo");

    if (docs.length === 0) {
      const empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = "Nothing uploaded yet.";
      group.appendChild(empty);
    }

    docs.forEach((doc) => group.appendChild(renderDoc(person, doc)));
    $("doc-groups").appendChild(group);
  }
}

function renderDoc(person, doc) {
  const row = document.createElement("div");
  row.className = "doc";

  const text = document.createElement("div");
  text.className = "doc-text";
  const label = document.createElement("span");
  label.className = "doc-label";
  label.textContent = docLabel(person.ownerType, doc.document_type);
  const file = document.createElement("span");
  file.className = "doc-file";
  file.textContent = doc.original_filename || "";
  text.append(label, file);

  const btn = document.createElement("button");
  btn.className = "attach";
  btn.textContent = "Attach";
  btn.addEventListener("click", () => attach(btn, person, doc));

  row.append(text, btn);
  return row;
}

// ---------------------------------------------------------------- attaching
// A predictable name for the school's records, rather than whatever the
// family's phone called it. Mirrors cleanFileName() in the web apps.
function cleanName(personName, label, originalFilename) {
  const base = `${personName}_${label}`.replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "");
  const ext = originalFilename && originalFilename.includes(".")
    ? originalFilename.split(".").pop().toLowerCase()
    : "";
  return ext ? `${base}.${ext}` : base;
}

async function blobToBase64(blob) {
  // FileReader rather than btoa(String.fromCharCode(...bytes)) — that spreads
  // the whole file across the argument list and blows the stack on anything
  // more than a megabyte or so.
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.readAsDataURL(blob);
  });
  return String(dataUrl).split(",")[1];
}

async function attach(btn, person, doc) {
  setError("");
  setNotice("");
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = "Working…";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !/^https?:/.test(tab.url)) {
      throw new Error("Open the school's application page in this tab first.");
    }

    // Ask for access to this site the first time, and remember it after.
    // Deliberately per-site rather than "read everything on every website":
    // this extension can see a school portal only because a consultant said so.
    const origin = new URL(tab.url).origin + "/*";
    const already = await chrome.permissions.contains({ origins: [origin] });
    if (!already) {
      const granted = await chrome.permissions.request({ origins: [origin] });
      if (!granted) throw new Error("Access to that site was declined, so nothing was attached.");
    }

    const url = await signedUrlFor(doc.file_url);
    const res = await fetch(url);
    if (!res.ok) throw new Error("Couldn't fetch that document.");
    const blob = await res.blob();

    const filename = cleanName(person.name, docLabel(person.ownerType, doc.document_type), doc.original_filename);
    const base64 = await blobToBase64(blob);

    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: attachFileToPage,
      args: [base64, filename, doc.file_type || blob.type],
    });

    const outcome = result?.result;
    if (!outcome || outcome.ok === false) {
      if (outcome?.reason === "no-input") throw new Error("No upload field found on this page.");
      if (outcome?.reason === "cancelled") return setNotice("Cancelled — nothing was attached.");
      throw new Error("Couldn't attach that file to the page.");
    }
    const tally = outcome.multiple && outcome.count > 1
      ? ` (${outcome.count} files now in this field)`
      : "";
    setNotice(`${filename} attached to "${outcome.field}"${tally}. Submit the school's form as usual.`);
  } catch (err) {
    setError(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

// ---------------------------------------------------------------- events
$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  setError("");
  $("login-btn").disabled = true;
  $("login-btn").textContent = "Signing in…";
  try {
    await signIn($("email").value.trim(), $("password").value);
    $("password").value = "";
    await afterLogin();
  } catch (err) {
    setError(err.message);
  } finally {
    $("login-btn").disabled = false;
    $("login-btn").textContent = "Sign in";
  }
});

$("signout").addEventListener("click", async () => {
  await clearSession();
  $("signout").hidden = true;
  setError("");
  setNotice("");
  show("view-login");
});

$("search").addEventListener("input", (e) => renderFamilies(e.target.value));
$("back").addEventListener("click", () => {
  setError("");
  setNotice("");
  show("view-families");
});

boot();
