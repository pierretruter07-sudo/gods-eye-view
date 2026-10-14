# Executive demo runbook

Target: 12–15 minute live demonstration for defence-prime executives.

## T-24 h

- [ ] The deployed build stamp on the welcome card matches the release commit
      in [VERIFICATION.md §4](VERIFICATION.md#4-results-log).
- [ ] `npm run doctor` on the host shows the Google or Cesium ion map,
      AISStream and FIRMS keys configured.
- [ ] Provider budgets and quotas are set (Google Cloud, AISStream, FIRMS).
      The demo link is treated as confidential.
- [ ] Full dry run on the presentation laptop, venue network and projector
      resolution.
- [ ] Backup recording of the whole flow (screen capture, 1080p), stored
      offline on the laptop.

## T-30 min

1. Plug in to power. Disable OS sleep and notifications.
2. Open the app in Chrome **full screen** (F11). Do not use `?nointro`: the
   welcome card is part of the story.
3. Let it load once, then reload. This warms the browser and server caches.
4. Check that flights, ships and satellites are visible on the globe.
5. Keep a second tab open on `?nointro&demo`. It is the fallback with the
   staged-event buttons.

## Script

| Time | Beat | What to do | What to say (gist) |
|---|---|---|---|
| 0:00 | **Hook** | Welcome card counting down over the spinning globe | "Everything you are about to see is public data, fused live." |
| 0:30 | **Director** | Click **Start now** (this enables the voice) | The system tours the planet on its own and interrupts for emergencies and major quakes. |
| 2:00 | **Incident** | Let the Director land on an incident. If none is live, use the fallback tab and press **Simulate 7700**. | Point out the **SIMULATED** badge on staged events: "the system never blurs real and illustrative." |
| 4:00 | **Intel HUD** | Click an aircraft or naval vessel. Use **Follow**. | Four cards, FEED vs SIMULATED chips, the dead-reckoned track. |
| 6:00 | **Analyst actions** | Satellite: **Predict passes**, then **Conjunction check**. Vessel: **Task imagery pass** (real Esri archive mosaic). | These are computed live from orbital elements and imagery. They are not mock-ups. |
| 8:00 | **Triage and watchlist** | Open **Triage**. Pin an item. Mark a 100 km area. | Feed-driven prioritisation plus the operator's own areas of interest. |
| 10:00 | **Exercise mode** | Switch to **Exercise**. Generate a package. | A fictional theatre for planning workflows. No live data, generic platforms, and the final authorisation stays with a human. |
| 12:00 | **Close** | Return to **Live**. The globe spins. | Roadmap: licensed feeds, the LLM analyst (HENRI), ED-153-aligned assurance. |

## Fallbacks

| Symptom | Action |
|---|---|
| Flights slow to appear at a stop | Keep talking. The data arrives in seconds. If not, skip with the Director's next stop. |
| A layer is empty | Say "provider rate-limited". Open the Layers panel and show the others. |
| No voice | Captions continue. Click once anywhere, or restart the Director. |
| Frame rate drops | The quality ladder adapts automatically. Close other apps and tabs. |
| Network down | Switch to the backup recording. |
| The app errors on load | Reload once. Then use the backup recording. |

## Do not

- Do not present SIMULATED content as real.
- Do not imply live mode can task or strike anything. It cannot.
- Do not claim certification. The system is in audit preparation (ED-153
  gap analysis).
