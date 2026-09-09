# Document Bridge — browser extension

Attaches a family's documents straight from their record into a school's
application form. No downloading, no Downloads folder, no renaming.

## Why this is an extension and not a button on the website

A page on `hhe-founders.vercel.app` cannot touch a page on a school's site.
That isn't a gap in the code — browsers forbid it on purpose. If any website
could reach into another site's file input, every site you visited could
quietly attach your files to a form on your bank.

An extension is a different thing. The consultant installs it deliberately and
grants it access to a specific site, so it is allowed to act inside that page.
Same result, legitimate route.

## What it does today

- Sign in with a consultant account (the same login as the desk; a family
  login is refused with a clear message).
- Search families, open one, see every uploaded document per person.
- Click **Attach**, and the file goes into the upload field on whatever page is
  open in the current tab — renamed to something a registrar can read, e.g.
  `Maya_Khan_Passport_copy.pdf`.
- If the page has several upload fields, it outlines them and asks which.

**There is no per-school configuration, on purpose.** Rather than a mapping of
"on this school's form, the passport goes in field #3" — which has to be
written per school and breaks silently whenever they redesign — it asks the
consultant to click the field. One extra click, works on a portal nobody has
ever seen, nothing to maintain. If a handful of schools turn out to be used
constantly, adding auto-detection for just those is a small addition on top.

## Setup

1. `cp config.example.js config.js` and fill in the Supabase URL and anon key
   (same pair the two web apps use — Supabase dashboard → Settings → API).
   `config.js` is gitignored, matching how the rest of the repo handles this.
2. Chrome → `chrome://extensions` → turn on **Developer mode** →
   **Load unpacked** → choose this folder.
3. Pin it, and click the icon to open the side panel.

Needs Chrome 114 or newer for the side panel. A side panel rather than a popup
for one reason that matters: a popup closes the moment you click the page, and
this flow is "click a document here, then click a field over there".

## Testing without touching a real school

Open `test/mock-school-form.html` in a tab (drag the file into Chrome). It has
three upload fields shaped like the ones real portals use — a plain input, one
hidden behind a styled button, and two side by side so the "which field?"
picker has something to ask. Each field reports the filename, type and byte
count it actually received, so you can see a real file arrived rather than just
a box that looks filled.

## Permissions, and why each one

- `storage` — keeps the signed-in session. A side panel and a service worker
  don't share a page, so this is the only place both can read it.
- `sidePanel`, `scripting` — open the panel; put the file into the page.
- `activeTab` — read the current tab's address to know which site to ask about.
- `optional_host_permissions: https://*/*` — **not granted up front.** The
  first time a consultant attaches something on a given portal, Chrome asks
  about that one site, and remembers the answer. The extension holds no
  standing access to anything until then.

Nothing is uploaded anywhere by this extension. It fetches one file from
Supabase storage over a signed link that expires in five minutes, hands it to
the page the consultant is already filling in, and forgets it. The school's own
form does the actual submitting, exactly as if the file had been chosen by hand.

## Known limits

- Chrome and Chromium browsers only. Safari and Firefox package extensions
  differently and would need separate builds.
- Desktop only — mobile browsers don't run extensions.
- A portal that blocks scripted input events, or uses a non-standard uploader
  that never touches a real `<input type="file">`, will need looking at
  individually. The test page covers the three common shapes; a real portal may
  still surprise us.
- Files are held in memory as base64 while being passed to the page, so
  something enormous (tens of MB) is worth testing before relying on it.
