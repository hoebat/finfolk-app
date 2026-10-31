# Trip reports

Create a trip under **Check in → Your posts → Trip reports**. Choose a beach and date range, add a public author name/story and existing Instagram post or Reel links. Historical links do not require a new FinFolk tag or Meta API authorization. This is independent of the Instagram automation and manual community-post rollout gates.

## Import a complete CSV

The template contains headers only: `date,depth_m,duration_seconds,dive_id`. There are no fabricated dive records. Excel, Numbers and Sheets can export CSV. Import up to 10,000 rows / 5 MB with comma, semicolon or tab separators; quoted cells, embedded newlines and UTF-8 BOMs are supported.

Map the date and at least a depth or duration column. Explicitly select ISO, day-first or month-first dates; metres or feet; seconds, minutes or m:ss / h:mm:ss durations. ISO timestamps with offsets are grouped in the beach timezone. Dates without a time remain date-only; local times are retained privately without inventing UTC timestamps. Missing measurements remain unknown. Invalid rows block confirmation rather than silently disappearing.

Preview the full date range and first ten private records. Repeated source dive IDs or exact timestamps need acknowledgement; equal depth/duration alone does not imply a duplicate. Confirm replacement if a dataset already exists. Upload batches remain below the existing API request-size limit and can be retried. Confirmation activates the complete import atomically; partial imports never replace the old dataset. Identical imports do not duplicate dives. Superseded completed imports are removed after replacement; incomplete uploads expire when the owner starts a new upload after a day.

Normalized records and original CSV columns are private in Neon. The private record viewer pages through all records, 100 at a time. The original CSV file itself is not retained. Imports do not create logbook sessions, check-ins, points or Regulars credit.

## Summary calculations

Daily and trip summaries contain dive count, measurement coverage, maximum/average/median depth, longest recorded dive and total recorded dive time. Trip averages are calculated from individual dives, not by averaging daily averages. Total recorded dive time is unknown if any dive lacks duration. A day without records is not claimed as a visit.

Time in the water is separate from recorded dive duration. Enter daily water minutes, an optional trip total, or both. A supplied trip total is labelled as entered and used when a complete daily total cannot be calculated. Conflicting daily and trip totals require acknowledgement. Optional comparison figures flag differences against the imported calculations; public reports use the calculated values, not hidden overrides. No breath-hold time is inferred from a photograph.

## Publication and withdrawal

Preview the exact public story, name, date range, Instagram links and daily/trip aggregates. Explicit ownership and public-listing consent are required; email verification follows the existing account policy. Individual dives, original columns, exact timestamps and coordinates are not in the public payload.

Links already approved for the same owner in the existing community/discovery system can be reused. Other historical links go to **Review → Trip report reviews** for ownership and beach checks. No retroactive Instagram tag is required. Review tokens prevent approving a different revision than the administrator inspected. Reported public trips can also be removed through this inbox.

Publishing stores a summary snapshot. Editing the draft, importing replacement dives or changing private columns does not change the public snapshot. Preview and publish a new revision to update it. An unapproved new revision leaves the previous public report available. Unpublish withdraws both published and pending revisions immediately while retaining private records. Account deletion removes trips and imports; deleted accounts never appear in public listings.

## Interfaces

- Public `GET /trips?beachId=…&ownerId=…`: up to 20 recent published report cards, optionally filtered by beach/owner.
- Public `GET /trips/:id`: explicit public-field allowlist; unavailable/unpublished reports return 404.
- Shareable static route `?view=trip&trip=UUID`; photos/videos remain on Instagram and embeds load only on request.
- Authenticated `/api`: `tripList`, `tripSave`, `tripGet`, `tripDives`, `tripImportBegin`, `tripImportBatch`, `tripImportConfirm`, `tripPreview`, `tripPublish`, `tripUnpublish`, `tripDelete`, `tripReport`.
- Administrator-only `tripReviewInbox` and `tripReview`, using `INSTAGRAM_ADMIN_IDS` and the existing reports store. Public/owner listing and review do not share the same API response.

Apply additive migration `0008_trip_reports.sql`. Run `npm test`, `npm run test:trips` on the isolated `finfolk-regulars-dev` branch, `npm run build` and the deployed smoke test. The database test uses 155 explicitly synthetic dives across nine days and cleans up fixtures. The actual Bondi CSV has not been supplied; do not publish or claim to import the real nine-day statistics until the owner provides them through the importer.
