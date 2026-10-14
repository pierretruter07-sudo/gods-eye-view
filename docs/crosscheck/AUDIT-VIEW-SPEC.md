# AUDIT view specification

**Status:** draft 0.1, 14 Oct 2026. **Owner:** CrossCheck integration.

**Purpose.** Give God's Eye View a one-press **AUDIT** mode. The live globe hands over to the CrossCheck orbit, showing God's Eye View's own ED-153 and ASVS assessment and the remediation trail behind it. The view must make sense to a first-time viewer, and it must be good enough for a reviewer to check evidence line by line.

## 1. Entry and exit

| ID | Requirement |
|---|---|
| AV-01 | An **AUDIT** button sits on the main God's Eye View panel and is reachable from every mode: free flight, Director tour, tracking, intel HUD and Exercise. |
| AV-02 | Pressing AUDIT pauses the active mode, saves the camera pose, and flies to a whole-globe view with a slow spin (≈2.5 Earth radii). |
| AV-03 | **Morph, ≈3 s.** The globe imagery and atmosphere fade to dark, the globe's latitude/longitude grid hands over to the orbit sphere's grid, the two rings grow from the equator, the cockpit panels fade in, and the God's Eye View screen controls fade out. |
| AV-04 | **Exit** (button or Esc at the top level) plays the morph in reverse and restores the saved camera pose and mode. |
| AV-05 | The orbit sphere is the real Earth radius in Earth-centred coordinates. The overlay copies the Cesium camera matrices every frame, so the sphere covers the globe exactly at every zoom. |
| AV-06 | three.js and the audit data load only when AUDIT is first pressed. Normal start-up time is unchanged. |

## 2. Navigation parity

The audit view uses God's Eye View's own Cesium camera controller, so every gesture behaves identically.

| ID | Gesture | Behaviour |
|---|---|---|
| AV-10 | Left-drag | Rotate the globe or orbit |
| AV-11 | Right-drag or scroll | Zoom |
| AV-12 | Middle-drag or Ctrl-drag | Tilt |
| AV-13 | Shift-drag (or the existing pan binding) | Pan |
| AV-14 | Double-click a pin or node | Fly to it and select it |
| AV-15 | Select from any list (alerts, evidence, search) | Fly to the item and open its detail card |
| AV-16 | Keyboard | The same shortcuts as God's Eye View; Esc clears the selection, then exits AUDIT |
| AV-17 | Touch | Pinch zoom, two-finger rotate and tilt, as on the globe |

The camera never auto-moves while the user is interacting. The guided tour pauses on any input.

## 3. Cockpit layout (fixed zones)

| Zone | Content |
|---|---|
| Top bar | Item name; one plain-English status line; How it works; Export; Exit AUDIT |
| Left · Status | Two dial gauges (Safety, Security) with readiness % and must-fix counts |
| Right · Detail | Empty until a selection; then a plain-English card: what it means, why it matters, the fix, linked items, history |
| Bottom left · Alerts | Must-fix list, most severe first |
| Bottom right · Layers | Must fix (on by default); Other gaps, Links between standards, Passing, Not applicable (each 15% until switched on); Area labels (off) |
| Centre | 3D orbit. All text faces the screen. No bloom except a soft glow on the single selected item. |

## 4. Guided tour

| ID | Requirement |
|---|---|
| AV-30 | On first open, show a large centred "First time here? Take the guided tour" card. Afterwards it lives on the How it works button. |
| AV-31 | Eight spotlight steps, each lighting one screen zone and its matching 3D element together: what CrossCheck is; the centre sphere; the two rings; the dials; raised pins; selecting a pin; links between standards; switching layers (hands-on). |
| AV-32 | Arrow keys step, Esc exits, and any camera input pauses the tour. |

## 5. Evidence replay (the remediation story)

| ID | Requirement |
|---|---|
| AV-40 | Data comes from `docs/evidence/ledger.json`, bundled at build time. |
| AV-41 | A timeline scrubber steps through the ledger stages and re-audits. As it moves, pins settle back onto the rings when their finding closes, and the gauges update. |
| AV-42 | The **Evidence** panel opens top-down: Level 0 (pipeline and before/now verdicts), Level 1 (waves and re-audits), Level 2 (workstreams), Level 3 (per-finding history with commit, test, date and new rating). |
| AV-43 | A **Before / Now** toggle compares the frozen baseline with the latest audit side by side. |
| AV-44 | Every history entry links to its commit or document in the repository. |

## 6. Verification

- Unit tests for the camera-matrix bridge, ledger parsing and layer state.
- A browser benchmark: frame rate during the morph and orbit on target hardware, using the existing `?fps` overlay.
- A navigation-parity checklist (AV-10 to AV-17) run on desktop and touch.
- Trace each AV requirement into REQUIREMENTS.md and VERIFICATION.md (trace check stays green).
