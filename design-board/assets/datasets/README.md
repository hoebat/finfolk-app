# Dataset catalogue prototype snapshot

Regenerate with `python scripts/prepare_dataset_catalogue.py /path/to/finfolk-next`.
This reads the local ocean records, frozen acquisition manifest/checkpoint,
coverage targets, area configuration and built production catalogue. It does not
connect to a database, acquire assets or publish releases.

The JSON is a dated, credential-free metadata snapshot, not a live admin API.
Publisher URLs are HTTPS, contain no credentials and have query/fragment values
removed. Raw archive payloads, operator configuration, auth identities and private
storage credentials are never copied. Some records are source collections, some
are specific published products: the UI labels these distinct statuses explicitly.

Shared sources retain one stable identity and may appear as references in many
state collections. Storage totals deduplicate asset checksums/identities rather
than adding repeated state references. Missing byte counts are labelled unknown.
Partial bytes sum logical checkpoint part sizes, including segmented transports
once; they are not usable complete originals or the conservatively charged budget.

Native reference geography is labelled candidate, not an installed production
service. The current published-site catalogue is a separate reference product.
Landforms are labelled Atelier-only until actually released beyond the bounded
local study. Public view shows only products recorded published in this snapshot.
The preview mode switch is not authentication. No sensitive data belongs here.

Review notes, checkboxes and display-only proposals are stored under a dedicated
localStorage key. These never change dataset validity or actual publication status.
Future delivery endpoint examples are labelled proposals, not working services.
