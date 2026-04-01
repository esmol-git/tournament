# QA Checklist: Match Protocol and Public Player Stats

Goal: verify that match protocol entry is fast and reliable, and that public player statistics are correct (goals, assists, yellow/red cards) across common and edge scenarios.

## Scope

- Protocol UI in admin sections (single unified modal).
- Protocol persistence (events payloads, score, status, timing reasons).
- Public statistics pages:
  - `/:tenant/tournaments/scorers`
  - `/:tenant/tournaments/participants-players`
  - stats blocks on `/:tenant/tournaments/table`

## Test Data Setup

Use one tenant with:

- 1 active tournament with at least 2 teams and 12+ players total.
- 1 completed tournament (for historical checks).
- Teams with clear names and logos.
- At least one playoff match (for extra time/penalty coverage).

Recommendation:

- Keep 2-3 "clean" matches dedicated to QA (resettable).
- Keep one "legacy" match with older payload variants if available.

---

## P0 Scenarios (Critical)

### P0-01: Goal + Assist happy path

1. Open protocol for a scheduled match.
2. Add event: Goal, select player A, set assist player B.
3. Save protocol.
4. Open public scorers page.

Expected:

- Player A: goals +1.
- Player B: assists +1.
- No changes in cards.

### P0-02: Goal scorer cannot be selected as assist

1. In goal event choose scorer.
2. Open assist dropdown.

Expected:

- Selected scorer is absent from assist options.

### P0-03: Card type mapping (yellow/red)

1. Add CARD event for player X with YELLOW.
2. Add CARD event for player Y with RED.
3. Save and open public stats pages.

Expected:

- Player X: yellow +1.
- Player Y: red +1.
- Counts are consistent on all three public pages.

### P0-04: Score and goal events consistency

1. Enter goals in events (e.g., 2:1 by events).
2. Set score manually to different value.
3. Attempt save.

Expected:

- Validation prevents save OR user resolves mismatch via "apply score from goals".
- Final saved score equals goal-event totals.

### P0-05: Team auto-detection by selected player

1. In new event pick player from combined list (without manually selecting team).

Expected:

- Event team is auto-set to player team.
- Team context labels are clear.

---

## P1 Scenarios (High Priority)

### P1-01: Substitution event validation

1. Add SUBSTITUTION event with player out and player in.
2. Try same player in/out.

Expected:

- Different players required.
- Save blocked with clear validation message for invalid input.

### P1-02: Custom event note

1. Add CUSTOM event with note.
2. Save and reopen protocol.

Expected:

- Note persists and is editable.

### P1-03: Time change reason

1. Change match date/time in protocol.
2. Try save without postpone reason.

Expected:

- Save blocked until postpone reason is selected.

### P1-04: Cancel reason

1. Change status to canceled.
2. Try save without cancel reason.

Expected:

- Save blocked until cancel reason is selected.

### P1-05: Locked match behavior

1. Open finished/played/canceled match as non-tenant-admin.

Expected:

- Protocol is read-only.
- No edit controls enabled.

### P1-06: Tenant admin override behavior

1. Open locked match as tenant admin.

Expected:

- Emergency edit mode available.
- Save still enforces validations.

---

## P2 Scenarios (Edge / Regression)

### P2-01: Legacy payload compatibility

Verify stats parsing for older payload field names:

- Assist: `assistPlayerId`, `assistantId`, `assistantPlayerId`, `assist_player_id`.
- Card: `color`, `cardColor`, shorthand `Y/R`, `yellow_card/red_card`.

Expected:

- Assists/cards counted correctly in public stats.

### P2-02: Missing/deactivated protocol event type reference

1. Open match containing event with deactivated/removed `protocolEventTypeId`.

Expected:

- Protocol opens without crash.
- Event falls back to builtin type in UI.

### P2-03: Large protocol entry UX

1. Enter 15-20 events in one match.

Expected:

- Modal remains responsive.
- Scrolling and footer actions remain usable.
- No accidental field resets.

### P2-04: Concurrent edits

1. Open same protocol in 2 tabs.
2. Save from tab A, then tab B.

Expected:

- Conflict behavior understood/documented.
- No silent data corruption.

### P2-05: Public cache refresh

1. Save protocol changes.
2. Observe stats page immediately and after cache TTL window.

Expected:

- Data updates within expected cache interval.

---

## Cross-Page Consistency Checks

For each tested match update, compare:

- `/:tenant/tournaments/scorers`
- `/:tenant/tournaments/participants-players`
- Top stats widgets on `/:tenant/tournaments/table`

Expected:

- Goals/assists/cards are numerically consistent everywhere.

---

## Execution Log Template

Use this section while running QA.

| Case ID | Priority | Status (PASS/FAIL/BLOCKED) | Notes | Bug Link |
|---|---|---|---|---|
| P0-01 | P0 |  |  |  |
| P0-02 | P0 |  |  |  |
| P0-03 | P0 |  |  |  |
| P0-04 | P0 |  |  |  |
| P0-05 | P0 |  |  |  |
| P1-01 | P1 |  |  |  |
| P1-02 | P1 |  |  |  |
| P1-03 | P1 |  |  |  |
| P1-04 | P1 |  |  |  |
| P1-05 | P1 |  |  |  |
| P1-06 | P1 |  |  |  |
| P2-01 | P2 |  |  |  |
| P2-02 | P2 |  |  |  |
| P2-03 | P2 |  |  |  |
| P2-04 | P2 |  |  |  |
| P2-05 | P2 |  |  |  |

---

## Recommended Implementation Order

1. Run all P0 manually and fix blockers immediately.
2. Run P1 and close UX/validation gaps.
3. Run P2 as regression pack before release.
4. Convert stable P0/P1 flows to automated tests (Playwright or API-level where possible).
