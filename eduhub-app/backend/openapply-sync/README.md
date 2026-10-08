# OpenApply sync

A scheduled job that signs in to each family's OpenApply parent portal, reads
what the school shows there, and copies it into the Consultant website so
staff don't have to retype it. It writes into the same tables staff already
use by hand (the Applications tab's timeline, fees and checklist), tagged
`source = 'openapply_sync'` so you can tell the two apart.

It is **additive**: staff can still log everything by hand, and if a login
breaks or a school changes its portal, nothing else stops working.

- Code: `sync.js` (Node + Playwright, no UI)
- Schedule: `.github/workflows/openapply-sync.yml`, every other day at 7am
  Dubai (`0 3 */2 * *` UTC), or on demand from the Actions tab
- Needs: Node 22, GitHub Actions secrets for Supabase (see Setup)

## What it does, in order

1. **Finds what to sync.** Every school that is on OpenApply: either tagged
   `application_platform = 'openapply'`, or whose "Apply now" link is an
   `openapply.com` address (so schools don't have to be tagged one by one).
   The portal login page is the school's stored `openapply_login_url`, or
   else `<that school's openapply.com address>/dashboard`. Then it takes
   every application at those schools.
2. **Picks the login for each family.** The parent's own application email
   (`parents.application_alias` + `@applications.heatherharries.com`) and
   `application_password`. The Mother's login is used first, then any other
   parent with one, skipping any marked inactive. A family with no login is
   skipped.
3. **Signs in once per family per school**, then reads all of that family's
   children at that school in turn. The login is tried once only, never
   retried, so an account can't get locked out. A short pause (1.5 seconds)
   separates sign-ins.
4. **Reads the Checklist page** for each child: every checklist item and
   whether it's done, with the date. If "Submit Application Form" is done and
   the application is still a draft, it is moved to *Application submitted*
   (with the date OpenApply shows) and a timeline event is added. Checklist
   items are saved on the application, and an event is logged when an item
   newly completes.
5. **Reads the Invoices & Fees page.** That page lists the whole family's
   fees together, so each row is matched to the right child by the *Student
   Name* column.
   - **Open Invoices** table: each row becomes an unpaid fee.
   - **Received Invoices** table: each row marks the matching fee paid, with
     the real amount and paid date (or adds it if it was never seen as open).
   - A fee that was open before and has since vanished from the open table is
     marked paid.
   - Each fee is keyed by the portal's own invoice reference
     (`external_invoice_ref`), so re-running never creates duplicates.
6. **Records what happened** on the application (`openapply_sync_status` and
   `openapply_sync_note`), shown on the Applications tab: `ok`,
   `login_failed`, `student_not_found` or `error`. A family with no portal
   account at a school is shown as such instead of being silently skipped.

### What it deliberately does NOT do

- It never sets a status past *submitted* (assessment booked, under review,
  offer, declined, waitlisted, offer accepted). Nothing on OpenApply's own
  pages has been seen to reliably signal those, so staff keep setting them by
  hand.
- It never deletes anything.
- It never writes in debug mode.

### Safety limits

- If 5 sign-ins in a row fail at one school, the rest of that school is
  skipped for the run (so one broken school can't eat the whole run).
- A failed login doesn't fail the run; only a crash does. Failed logins show
  up on the application itself.
- The workflow has a 180 minute time limit.

## Setup (one-time)

1. **Run the SQL in Supabase** (SQL Editor, paste, Run), in order, if not
   already run:
   - `backend/schema/eduhub_schema_addendum_61_mark_openapply_schools.sql`
   - `backend/schema/eduhub_schema_addendum_62_openapply_login_url.sql`
   - `backend/schema/eduhub_schema_addendum_65_openapply_integration.sql`
   - `backend/schema/eduhub_schema_addendum_92_openapply_all_schools.sql`
     (tags every school with an `openapply.com` link, fills in missing login
     URLs, and adds the sync status columns)
2. **Add two GitHub repo secrets** (repo, Settings, Secrets and variables,
   Actions, New repository secret):
   - `SUPABASE_URL`: the project URL (Supabase, Project Settings, API).
   - `SUPABASE_SERVICE_ROLE_KEY`: the **service_role** key from the same page,
     not the anon key. It bypasses RLS on purpose, because the job has to
     read every family's login and write to every application. Treat it like
     a master password: it only ever lives in this secret.
3. **Add one repo variable** (same page, Variables tab):
   `OPENAPPLY_SYNC_DEBUG`. Use `true` until you've checked a debug run, then
   `false` (see below).

## Checking it works (debug run)

Repo, Actions tab, "OpenApply sync", "Run workflow". Leave **Debug mode**
ticked. Optionally paste one `applications.id` into `debug_application_id` to
test a single family/school instead of everyone.

Debug mode signs in and reads pages, saves screenshots and the raw HTML, and
**writes nothing** to Supabase. When it finishes:

1. Open the run's **Run sync** step. It prints exactly what it read for each
   application, for example `checklist: 5/12 complete, application form
   submitted 17 September, 2026`, and the fee rows as JSON. Compare against
   what you see when you log in to OpenApply yourself.
2. If something looks wrong, download the `openapply-debug-output` artifact
   at the bottom of the run page (screenshots plus `checklist.html` and
   `invoices.html` per application, kept 14 days) and use it to adjust the
   selectors in `sync.js`.

## Going live

1. Set the repo variable `OPENAPPLY_SYNC_DEBUG` to `false`.
2. For a manual run, **untick Debug mode** before pressing Run workflow (the
   tick overrides the variable for that run). The scheduled run uses the
   variable.
3. From then on it writes, tagged `source = 'openapply_sync'`.

To pause it, set the variable back to `true`, or disable the workflow in the
Actions tab.

## Adding a new school

Usually nothing to do: any school whose "Apply now" link is an `openapply.com`
address is picked up automatically, and its login page is worked out from that
link. If a school's portal login lives somewhere else (for example Repton
School Abu Dhabi, whose `openapply_login_url` is empty), set it in Supabase:

```sql
update public.schools
set application_platform = 'openapply',
    openapply_login_url = 'https://<school>.openapply.com/dashboard'
where name = '<school name>';
```

The selectors are the same across the schools seen so far (Queen Elizabeth's,
Jebel Ali, Dubai British Jumeira). A school with a different layout will show
`error` or an empty checklist on its applications.

## When a family shows "login failed" or "student not found"

- **login failed**: the family has no account on that school's portal yet, or
  the stored password no longer matches. Check the parent's application email
  and password on the Family details tab, and try logging in to that school's
  portal by hand.
- **student not found**: the child isn't on that parent's portal account yet.

Neither stops anything else; staff just carry on by hand for that family.

## Selector configuration

Everything that depends on the OpenApply pages is in the `CONFIG` object at
the top of `sync.js` (login fields, checklist items, open and received
invoice tables). Confirmed against real pages on 22 September and 7 October
2026. If a school changes its layout, that's the only part that should need
editing.

## Local testing (optional)

```
cd eduhub-app/backend/openapply-sync
npm install
npx playwright install --with-deps chromium
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... OPENAPPLY_SYNC_DEBUG=true npm run sync
```

Debug output lands in `debug-output/` (not committed).
