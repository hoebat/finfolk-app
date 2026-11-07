# Try FinFolk

Start the local server with `npm run moodboard`, then open <http://127.0.0.1:8770/try/>. The Atelier header also has a Try FinFolk link. This is a local product sandbox, with fictional accounts and sample records; it does not create accounts, send invitations, redeem real offers or connect social providers or devices.

## A connected experience

The first visit starts with profile setup and favourite places, chosen on a MapLibre GL map using the same basemap as Explore. Pins and the searchable list stay in sync; selecting places preserves the map instance. If GL or tiles are unavailable, the list remains usable. Completing setup opens the map with a selected place. Later visits resume the previous screen. The shell supplies one four-tab menu: Explore, Community, Dives and You. Embedded mockups share the sandbox data while their individual navigation and studio controls are hidden.

- Explore retains map context and place notes as you move between sections. Notes and votes never award extra Finnies.
- Community and You show the same sample balance as Finfolk Coop. Redemption reserves stock, creates a receipt and debits Finnies once. Operator fulfilment/refund affects the original member’s claim; refunds restore the original amount and stock once.
- Dives opens My dives, with Mates’ dives and Tagged posts alongside. An outing can contain multiple descents. Save/import stays private. Post to mates previews the selected caption, metrics and photos/social attachments as a separate snapshot; changing the log does not change that snapshot. Withdrawal keeps the original outing. Both sides of a connection must be accepted, and blocks take precedence. Fictional Kai activity is labelled; profiles without an accepted Kai connection can explicitly add the sample mate.
- Tagged posts are a simulated owner-only inbox, deduplicated by provider and post ID. A known dive code suggests an outing but never attaches or publishes automatically. Confirm the actual dive date and place, then attach to a matching outing or create a new private one. Publication date is kept separately.
- The optional Event link accepts only existing, published, non-cancelled Events the member has joined. Past Events are allowed. Historical associations survive cancellation or leaving; Event details still require access. Event pages show only authorised posted snapshots, never private notes, raw logs or exact meeting instructions.
- A saved private session appears in the logbook. Simulated watch import adds a private sample session without creating duplicate records on repeated import. Profile logs include only explicitly public sessions. Media and collected posts stay in the active persona’s sandbox records.
- Page ownership and admin membership control event creation. Published public Events appear in Community and on the map at their general meeting area; saved drafts remain with their organiser. Joining an Event makes it available in the Dives editor. Private plans and exact meeting details are excluded from other personas’ public projections.
- Breathing practice, device readings and social collection remain labelled simulations. Existing device/integration mockups remain concepts; unsupported external operations display a simulation message rather than contacting a provider.

## Demo controls

The Demo menu provides four personas: Member, Page owner, Page admin and Coop operator. Switching replaces the active feature frame and invalidates its previous data adapter so late saves cannot change another persona’s records. Pages and notes are shared where appropriate; profiles, private sessions, media and wallet histories stay scoped to their owner. Only the Coop operator can edit catalogue items and complete claims.

Product scenarios opens registered mockup states. Authentication entries open simulated profile setup; no passwords or real verification codes are requested. Back to Atelier returns to the studio. Reset demo requests confirmation and replaces only sandbox state.

## Storage and architecture

`finfolk:sandbox:v1` is a separate versioned IndexedDB database containing structured records and portrait/photo blobs. Its payload is now version 2: version 1 data upgrades in place, preserving profiles, sessions, legacy public logs, onboarding, media and Finnies. Existing logs are never automatically posted to mates. Editing a legacy public log through Dives makes that original log private before saving the changes. The outer `/try/` shell owns the store, route history, theme and current persona. Each active same-origin frame gets an adapter scoped to its current generation and actor. Messages require the active frame and matching origin. Feature-local storage calls are redirected to the sandbox adapter before feature modules initialise. Standalone Atelier screens continue using their original stores; the new standalone Dives study has its own `finfolk:atelier:dives:v2` database. The connected sandbox remains the recommended complete experience.

Writes are queued in order. Storage failure falls back to the outer shell’s in-memory state, with a visible visit-only notice. Keep that tab open to retain temporary changes. Theme changes apply to both shell and feature; no saved production or Atelier theme is overwritten.

## Verification

`npm run test:dives` runs the Dives domain and full browser journeys, including migration, snapshot privacy, connection/block checks, Event eligibility, social review, media, persistence and responsive themes.

`npm run test:sandbox` includes these and runs store ownership/transaction checks, complete browser flows, refresh/reset/isolation, blocked storage, four themes at four viewport sizes, and a sweep of all registered product screens. The regular moodboard suite includes the sandbox checks. No production APIs, schema migrations or deployment are involved.
