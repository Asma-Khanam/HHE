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

The SQL lives at the top level of this repo and is applied by pasting each
file into the Supabase dashboard's SQL editor. Run them in this order; every
file is safe to re-run.

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

`eduhub_seed_data.sql` and `eduhub_reset_all_test_data.sql` are test helpers.
The reset script is destructive — read the comments at the top before running
it against anything you care about.

## Who counts as staff

Having a row in the `staff` table, and nothing else. There is deliberately no
policy allowing a signed-in user to insert into that table, so signing up
through the founders app creates an ordinary login and grants no access to
anyone's records. A staff row can only be added by hand from the Supabase
dashboard. Please keep it that way.

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
