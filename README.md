# Heather Harries Education Hub — Eduhub

Two React apps and one Supabase database behind them.

| | What it is | Who signs in | Dev port |
|---|---|---|---|
| `eduhub-app/frontend` | The family-facing application form — sign up, fill in the household, children and current schools, upload documents, submit. | Families | 5173 |
| `eduhub-app/founders` | The staff portal — today's tasks, the caseload, and one full record per family. | Heather Harries staff | 5174 |

Both talk to the same Supabase project directly from the browser. There is no
server of our own: what a signed-in person is allowed to read or write is
decided entirely by Postgres row-level security policies, not by application
code. That's the single most important thing to understand before changing
anything.

## Running either app locally

```bash
cd eduhub-app/frontend      # or eduhub-app/founders
cp .env.example .env        # then fill in the two values from Supabase
npm install
npm run dev
```

Both `.env` values come from the Supabase dashboard under Settings → API. Use
the **anon public** key, never the service_role key — the service_role key
bypasses row-level security entirely and must never appear in frontend code
or in this repository.

## Database

The SQL lives in `eduhub-app/backend/` and is applied by pasting each file
into the Supabase dashboard's SQL editor. `schema/` is the migration chain —
run these in order; every file is safe to re-run.

1. `eduhub_schema.sql` — the eight core tables, and RLS policies limiting each
   family to their own rows.
2. `setup_documents_storage.sql` — the private `documents` storage bucket and
   its per-user-folder policies.
3. `eduhub_schema_addendum_1.sql` — the extra columns the application form
   collects (passport name parts, year groups, SEN, current-school details).
4. `eduhub_schema_addendum_2_staff.sql` — the `staff` table and read access
   for staff across every family. **Has a manual step at the bottom**: a staff
   login has to be inserted by hand after that person has signed up.
5. `eduhub_schema_addendum_3_staff_workflow.sql` — staff write access, plus
   document verification, pipeline stages, per-child school applications and
   the `tasks` table.
6. `eduhub_schema_addendum_4_addresses.sql` — per-parent and per-child address
   columns, backfilled from the old single family address.
7. `eduhub_schema_addendum_5_case_notes.sql` — the `case_notes` table behind
   the founders portal's call log, with a trigger that stamps and locks the
   author on every row.
8. `eduhub_schema_addendum_6_calendar.sql` — the `calendar_events` table
   behind the founders' shared calendar (deadlines, reminders, team events),
   with a per-event `visible_to_client` flag.
9. `eduhub_schema_addendum_7_application_email.sql` — per-family application
   email aliases (`families.application_alias`) and `log_application_email()`,
   the function the Cloudflare Email Worker calls. Paused/on hold — see
   `backend/utilities/cloudflare-application-email-worker.js` for the Worker
   script and setup notes.
10. `eduhub_schema_addendum_8_document_status_simplify.sql` — drops the
    "Verified" document status; a document just counts as received once
    uploaded.
11. `eduhub_schema_addendum_9_payments.sql` — the `payments` table (fees,
    deposits — amount, due date, paid/unpaid/waived) behind the founders
    portal's Payments panel and Today-page rollup.
12. `eduhub_schema_addendum_10_school_visits.sql` — `visit_date`/`visit_notes`
    on `applications`, so a school visit shows on the shared calendar
    alongside tasks and calendar_events.
13. `eduhub_schema_addendum_11_payments_client.sql` — makes payments
    client-facing: a `submitted` status, a `receipt_path` for the uploaded
    proof, and the RLS + trigger that let a family attach a receipt and mark
    a payment submitted without being able to touch anything else on it.
14. `eduhub_schema_addendum_12_family_client_guard.sql` — locks
    `pipeline_stage`, `owner_staff_id`, `membership_type` and the application
    alias columns on `families` to staff-only at the database level (they
    were only ever staff-only by the app never showing a family a way to
    edit them — this closes that for real). `origin`/`destination` are
    deliberately left open: the family sets those from their own dashboard
    now (MoveDetailsCard).
15. `eduhub_schema_addendum_13_staff_admin.sql` — adds a `role`
    (`admin`/`member`) to `staff` plus `add_staff_member` /
    `remove_staff_member` / `set_staff_role`, so an admin can manage the
    whole team from the founders app's Team page — no Supabase access needed
    after this one file is run. See "Who counts as staff" below.

`backend/utilities/` holds scripts run on demand rather than once, in no
particular order:

- `grant_staff_access.sql` — the only way to give a signed-up login access to
  the founders portal; see the comments at the top for the exact steps and
  the lowercase-email gotcha.
- `cloudflare-application-email-worker.js` — the Cloudflare Email Worker
  script for the (currently paused) per-family application-email feature.
- `eduhub_seed_data.sql` and `eduhub_reset_all_test_data.sql` are test
  helpers. The reset script is destructive — read the comments at the top
  before running it against anything you care about.

## Who counts as staff

Having a row in the `staff` table, and nothing else. Signing up through the
founders app only ever creates an ordinary login and grants no access to
anyone's records — someone with a `staff` row has to grant it.

As of addendum 13, that no longer has to mean Supabase access. Every `staff`
row has a `role`: `admin` or `member`. An admin can add, remove, and
promote/demote anyone from the founders app's own Team page (`/staff/team`,
only linked in the sidebar for admins) — the person being added still has to
sign up for their own login first, same as always, this just replaces the
manual SQL insert with a form. A `member` has full staff access to every
family but can't manage the team.

The very first admin(s) still have to be set from Supabase directly — running
addendum 13 automatically promotes everyone already in `staff` to `admin`, so
whoever's using the app today can start adding the rest of the team
immediately. After that, this table is never touched from the Supabase
dashboard again — the app itself refuses to ever end up with zero admins
(`remove_staff_member`/`set_staff_role` both check for that), so team
management can't get locked to one person's continued access.

## Deployment

`eduhub-app/frontend` deploys to Vercel with the project's root directory set
to `eduhub-app/frontend`. The two `VITE_` variables above are set in Vercel's
own environment-variable settings; Vite inlines them into the built bundle, so
changing one requires a redeploy. `vercel.json` in that folder rewrites every
path to `index.html`, which is what stops a refresh on a deep link like
`/app/form` from 404ing.

Whenever the deployed URL changes, Supabase needs to know: Authentication →
URL Configuration, both the Site URL and the redirect allow-list. Sign-up
confirmation emails link back to whatever is set there, so a stale value sends
new families to a dead link.
