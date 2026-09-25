# OpenApply sync (Track B)

Logs into each family's OpenApply portal and copies fee/status updates into
the same `application_events` / `application_fees` tables the founders app's
"Timeline & fees" panel already writes into by hand. Runs on a schedule via
GitHub Actions (`.github/workflows/openapply-sync.yml`) -- every other day (7am Dubai) once
it's live.

## Status (22 Sept 2026)

The selectors in `sync.js` are now confirmed against a real page -- a debug
run against Layla Hadley's Queen Elizabeth's School application logged in
successfully and reached both the Checklist and Invoices & Fees pages. What
that run showed, and what's still open:

- **Login** -- works with the parent's stored application email/password.
- **Checklist** -- read correctly (5/12 items complete for that run). The
  script only ever acts on ONE signal from it: the "Submit Application
  Form" item being done, which moves an application draft -> submitted and
  records the date OpenApply shows. It never sets any status past that --
  nothing on OpenApply's own pages has been seen to reliably signal
  assessment booked / under review / offer / declined yet, so those stay
  manual, same as always.
- **Invoices & Fees** -- read correctly, matched to the right child by the
  "Student Name" column (this page lists the whole family's fees together).
  Only ever seen a family with nothing paid yet, so every fee row is
  currently treated as unpaid -- a family with a paid invoice hasn't been
  seen to confirm what that looks like on the page.

It still ships in **debug mode by default** (logs in, saves screenshots and
HTML, writes nothing) until a debug run's actual console output has been
checked against what's really true for that application -- see "Running a
debug pass" below.

## One-time setup

1. **Tag which schools use OpenApply and store their portal URL.** Run
   `backend/schema/eduhub_schema_addendum_61_mark_openapply_schools.sql`,
   then `backend/schema/eduhub_schema_addendum_62_openapply_login_url.sql`,
   in Supabase (edit the school name/URL in each first if it's not Queen
   Elizabeth). The second one is a DIFFERENT link from the school's existing
   "Apply now" URL -- it's the actual OpenApply portal a family logs into,
   e.g. `https://qesdubaisportscity.openapply.com/dashboard`, which is what
   the sync script needs to navigate to.
2. **Add two GitHub repo secrets** (repo -> Settings -> Secrets and
   variables -> Actions -> New repository secret):
   - `SUPABASE_URL` -- your project's URL (Supabase dashboard -> Project
     Settings -> API -> Project URL).
   - `SUPABASE_SERVICE_ROLE_KEY` -- the **service_role** key from that same
     page (NOT the anon/public key -- this one bypasses RLS on purpose, since
     the sync job needs to read every family's stored login and write to
     every application, not just one signed-in user's own). Treat this key
     like a master password: it is never put in code, only in this one
     secret slot.
3. **Add one GitHub repo variable** (same Settings page, "Variables" tab
   instead of "Secrets"): `OPENAPPLY_SYNC_DEBUG` = `true`. This is what keeps
   the automatic every-other-day run in debug/no-write mode until it's been
   checked. A manual run's checkbox (see below) overrides this for that one
   run only.

## Running a debug pass

Repo -> Actions tab -> "OpenApply sync" -> "Run workflow". Leave "Debug
mode" checked. Optionally paste one `applications.id` into
"debug_application_id" to only test one family/school instead of every
OpenApply application at once (recommended).

Two things to check once it finishes:

1. **The run's own log** (click into the run -> the "Run sync" step) now
   prints exactly what it read, e.g. `checklist: 5/12 complete, application
   form submitted 17 September, 2026` and the fee rows found as JSON.
   Compare that against what you see logged into OpenApply yourself for
   that same application -- if the numbers match, the parsing is right.
2. If something looks off, download the `openapply-debug-output` artifact
   at the bottom of the run page (a zip of screenshots + raw HTML per
   application) and send me the `checklist.html`/`invoices.html` files (or
   just describe the mismatch) so I can adjust the selectors in `sync.js`.

## Going live

Once the selectors are confirmed against a real debug run:

1. Set the `OPENAPPLY_SYNC_DEBUG` repo variable to `false`.
2. The next scheduled run (or a manual run with the debug checkbox
   unchecked) will actually write to `application_events` /
   `application_fees`, tagged `source: 'openapply_sync'`.

Manual entry through the founders app keeps working exactly as before, at
any point -- this job is additive, and if a login breaks or a school changes
its portal layout, staff can just keep logging updates by hand in the same
Timeline & fees panel.

## Local testing (optional)

```
cd backend/openapply-sync
npm install
npx playwright install --with-deps chromium
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run sync
```
