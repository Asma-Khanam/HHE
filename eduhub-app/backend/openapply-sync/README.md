# OpenApply sync (Track B)

Logs into each family's OpenApply portal and copies fee/status updates into
the same `application_events` / `application_fees` tables the founders app's
"Timeline & fees" panel already writes into by hand. Runs on a schedule via
GitHub Actions (`.github/workflows/openapply-sync.yml`) -- every 4 hours once
it's live.

## Before this can do anything real

The CSS selectors in `sync.js` (the `CONFIG` object near the top) are
guesses -- nobody has checked them against OpenApply's actual page markup
yet. That's why it ships in **debug mode by default**: it logs in, saves a
screenshot and the full HTML of the Checklist and Invoices & Fees pages for
each application, and writes nothing to the database. Once we've seen a real
run's output, the selectors get corrected and it's safe to flip live.

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
   the automatic every-4-hours run in debug/no-write mode until it's been
   checked. A manual run's checkbox (see below) overrides this for that one
   run only.

## Running a debug pass

Repo -> Actions tab -> "OpenApply sync" -> "Run workflow". Leave "Debug
mode" checked. Optionally paste one `applications.id` into
"debug_application_id" to only test one family/school instead of every
OpenApply application at once (recommended for the very first run).

When it finishes, open the run and download the `openapply-debug-output`
artifact at the bottom of the page -- it's a zip of screenshots and raw HTML
per application, one subfolder per `applications.id`. Send me (Claude) the
`checklist.png`/`checklist.html` and `invoices.png`/`invoices.html` files (or
just describe what you see) and I'll fix the selectors in `sync.js` to match
the real page instead of my current guesses.

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
