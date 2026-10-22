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
5. Keep a second tab open on `?nointro` (no welcome card) as a quick
   restart, and the backup recording ready.
6. Optional check, in the browser console: `__gevTour.arrivalLog()` shows,
   per Director stop, how long it held for Google tiles and whether they
   settled; `__gevWorld.state()` shows the Sun, shadows, night city and sky.

## Script

| Time | Beat | What to do | What to say (gist) |
|---|---|---|---|
| 0:00 | **Hook** | Welcome card counting down over the spinning globe | "Everything you are about to see is public data, fused live." |
| 0:30 | **Director** | Click **Start now** (this enables the voice) | The system tours the planet on its own and interrupts for emergencies and major quakes. |
| 1:30 | **The real world, right now** | At a city stop, point out the light. | The Sun is where it really is: real-time shadows, a golden hour, the night side with its city lights, and the real stars overhead. |
| 2:00 | **Incident** | Let the Director land on a live incident (earthquakes and emergency squawks are shown as they happen; there are no staged events). | Point out the **FEED** and **SIMULATED** chips in the data sheets: "the system never blurs real and illustrative." |
| 4:00 | **Intel HUD** | Click an aircraft or naval vessel. Use **Follow**. | Two data sheets, FEED vs SIMULATED chips, the dead-reckoned track. |
| 6:00 | **Analyst actions** | Satellite: **Predict passes**, then **Conjunction check**. Vessel: **Task imagery pass** (real Esri archive mosaic). | These are computed live from orbital elements and imagery. They are not mock-ups. |
| 8:00 | **Triage and watchlist** | Open **Triage**. Pin an item. Mark a 100 km area. | Feed-driven prioritisation plus the operator's own areas of interest. |
| 12:00 | **Close** | Press **Stop** (or Esc) to end the Director; the globe spins. | Roadmap: licensed feeds, the LLM analyst (HENRI), ED-153-aligned assurance, CrossCheck. |

## Fallbacks

| Symptom | Action |
|---|---|
| Flights slow to appear at a stop | Keep talking. The data arrives in seconds. If not, skip with the Director's next stop. |
| A layer is empty | Say "provider rate-limited". Open the Layers panel and show the others. |
| No voice | Captions continue. Click once anywhere, or restart the Director. |
| Frame rate drops | The quality ladder adapts automatically (shadows go first). Close other apps and tabs. If it persists, reload with `?shadows=0`. |
| A camera shows **NO LIVE FRAME** | That network is down; the card says so. Move on to the next stop. |
| Network down | Switch to the backup recording. |
| The app errors on load | Reload once. Then use the backup recording. |

## Do not

- Do not present SIMULATED content as real.
- Do not imply live mode can task or strike anything. It cannot.
- Do not claim certification. The system is in audit preparation (ED-153
  gap analysis).
