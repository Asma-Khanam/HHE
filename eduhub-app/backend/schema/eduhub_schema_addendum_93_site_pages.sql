-- Addendum 93 (7 Oct 2026): editable public pages -- starting with the Privacy policy.
--
-- The App Store and Google Play both ask for a public privacy policy link, and the
-- founders need to be able to change the wording themselves. So the text lives here,
-- not in the code. Anyone (signed in or not) can READ a page -- it has to be public
-- for the store listing -- and only a staff admin can change it. Nothing is deleted.
-- A first draft is added below; it only goes in if the page doesn't exist yet, so
-- re-running this never overwrites the founders' edits. Safe to re-run.

create table if not exists public.site_pages (
  slug text primary key,
  title text not null,
  body text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

alter table public.site_pages enable row level security;

drop policy if exists "anyone reads site pages" on public.site_pages;
create policy "anyone reads site pages" on public.site_pages for select using (true);

drop policy if exists "admin adds site pages" on public.site_pages;
create policy "admin adds site pages" on public.site_pages for insert with check (public.is_staff_admin());

drop policy if exists "admin edits site pages" on public.site_pages;
create policy "admin edits site pages" on public.site_pages for update
  using (public.is_staff_admin()) with check (public.is_staff_admin());
-- No delete policy.

insert into public.site_pages (slug, title, body) values (
  'privacy',
  'Privacy policy',
  $policy$This policy explains what Heather Harries Education ("we", "us") does with the information you give us through the Relocate app and website, and the choices you have. It is a first draft and is written to be edited by our team.

## Who we are

Heather Harries Education helps families find schools and relocate to the UAE. You can reach us at relocate@heatherharries.com.

## What we collect

- Your details and your partner's: names, email, phone, address, nationality and work details you choose to add.
- Your children's details: names, dates of birth, current school and year group, learning needs you tell us about, and the schools you are interested in.
- Documents you upload, such as passports, Emirates IDs, birth certificates, school reports, photos and medical or vaccination records.
- Your move details: dates, budget, areas, and notes from our calls and emails with you.
- Payment details of what you have been invoiced and paid. We do not store your card number.
- Basic technical information needed to keep the app running and secure.

## Why we use it

- To find and shortlist schools, book tours and assessments, and manage your applications.
- To fill in school application forms and portals on your behalf, with your permission.
- To keep you updated and answer your questions.
- To invoice you and keep our records.

## Who can see it

- Our consultants who work on your case.
- The schools you ask us to apply to or visit. We share only what an application needs.
- The services that run the app for us: our database and file storage provider (Supabase), our website host (Vercel), our email provider, and Zoom where we record call notes with your knowledge.

We do not sell your information and we do not use it for advertising.

## Children's information

We collect information about children only from their parents or guardians, and only to help with school search and applications. If you want us to remove a child's details, tell us and we will.

## How we keep it safe

Your account is protected by your login, and the information is stored with access controls so each family can see only its own information, and only our team can see families' records. Uploaded documents are kept in private storage. No system is perfectly secure, so please use a strong password and do not share your login.

## How long we keep it

We keep your information while we are working with you and for a reasonable period afterwards for our records. You can ask us to delete it sooner.

## Your choices

You can ask us to show you what we hold, correct it, or delete it, by emailing relocate@heatherharries.com. You can also edit most of your details yourself in the app.

## Changes to this policy

We may update this policy from time to time. The date at the top of the page shows when it was last changed.$policy$
)
on conflict (slug) do nothing;

notify pgrst, 'reload schema';
