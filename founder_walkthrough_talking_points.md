# Founder Walkthrough — Talking Points

*For the live screen-share, walking through the Supabase Table Editor. Plain-English, no database jargon — click into each table as you talk through it.*

## Opening (30 seconds)

"I've spent today mapping out and building the structure that'll hold all the client information — every family, their kids, the schools they're applying to, and every document that comes in. Nothing has real client data in it yet, this is the skeleton it'll all live in. Let me walk you through it."

## The walkthrough — click into each table as you go

**1. families** — "This is created the moment someone signs up. One family, one account. Everything else — the parents, the kids, the applications — hangs off this."

**2. parents** — "Both parents' details live here — contact info, employer, nationality, everything from the intake list. A family can have up to two."

**3. children** — "Same idea, but for the kids — date of birth, medical or inclusion needs, hobbies, everything the schools ask for. A family can add as many children as they have."

**4. current_schools** — "This tracks the child's *current* school — separate from where they're applying to. This is also where we'll track whether we've requested that confidential reference yet, and whether we've gotten it back."

**5. schools** — "This is our own list of the schools we work with — the ones families apply to. We control this list, not the families."

**6. applications** — "This is the actual application — which child, which school, and where it stands: draft, submitted, waiting on documents, under review, offer, and so on. A child can have more than one application if they're applying to multiple schools."

**7. documents** — "Every file — birth certificates, passports, school reports, psychology reports, whatever comes in — lands here, tagged with who it belongs to. One flexible place instead of a rigid slot for every possible document type, so when a school asks for something we didn't originally plan for, we're not stuck redesigning things."

## One thing worth reassuring them on

"Right now, a family can only ever see their own information — not anyone else's. That's locked in at the database level, not just something the app happens to enforce."

## Open questions to raise with them (things you need their call on)

- **Verification step at sign-up** — "We said email + password only, kept simple. Do we want a verification code as an extra safety step, or keep it to just email + password with nothing else?"
- **Document storage** — "Right now a document just stores wherever the file lives. Before we go further, worth deciding: do we want these files sitting in Supabase's own file storage (recommended — built for this), or somewhere else?"
- **Who on the team needs to see everything** — "Right now only the family that signs up can see their own data — nobody on our side has a dashboard view across all families yet. That's the next real decision: who on the team needs that, and what should they be able to see or change?"

## Closing

"Next step is building the actual sign-up screen and the first few forms — frontend and backend together this time, so you'll start seeing something clickable, not just tables."
