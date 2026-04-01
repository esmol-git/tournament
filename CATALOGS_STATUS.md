# Catalogs Status

This file fixes the current catalog baseline and prevents adding "checkbox" catalogs
without real usage in the product.

## Status Legend

- `active` - used in business flows (admin + backend checks and/or public pages)
- `standby` - CRUD exists, but core flow usage is partial
- `deprecated` - hidden from navigation, kept only for compatibility/migration

## Current Matrix

| Catalog | Admin CRUD | Used in Admin Flows | Used in Backend Logic | Used in Public | Status |
|---|---|---|---|---|---|
| Competitions | yes | Tournament create/edit/filter | Tournament validation & filters | Tournament details | active |
| Seasons | yes | Tournament create/edit/filter | Tournament validation & filters | Tournament details | active |
| Age Groups | yes | Team + Tournament assignment/filter | Team/Tournament compatibility checks | Tournament details | active |
| Regions | yes | Team + Stadium forms/filters | Team/Stadium validation | - | active |
| Stadiums | yes | Tournament assignment | Tournament validation | Tournament details | active |
| Referee Categories | yes | Referee forms | Referee validation | - | active |
| Referee Positions | yes | Referee forms | Referee validation | - | active |
| Referees | yes | Tournament referee assignment | Tournament validation | Tournament details | active |
| Protocol Event Types | yes | Match protocol editor | Match protocol strict validation | - | active |
| Match Schedule Reasons | yes | Match postpone/cancel flows | Scope validation by action | - | active |
| Reference Documents | yes | Admin documents page | Public tournament documents API | Public tournament/table + documents page | active |
| Management Members | yes | Admin management page | Public management API | Public about page | active |
| Team Categories | yes | Standalone CRUD page only | Not connected to effective team/player constraints | - | deprecated |

## Catalog Governance Rules

Any new catalog must satisfy all rules before being added to navigation:

1. At least one concrete admin flow consumes it (not only CRUD page).
2. At least one backend validation/business rule uses it.
3. It has a public/read model if related to public-facing sections.
4. It has a clear owner domain (teams/tournaments/matches/public-site).

If a catalog does not meet the rules, keep it out of navigation and mark as `standby`.

