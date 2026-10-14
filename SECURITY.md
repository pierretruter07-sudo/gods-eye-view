# Security

God's Eye View is a demonstration client for **public** data. It is not a
hardened production service and has not been penetration-tested. This
document sets out its security model, its known exposures and how to report
issues.

## Reporting a vulnerability

Report privately through GitHub's
[private vulnerability reporting](https://github.com/pierretruter07-sudo/gods-eye-view/security/advisories/new).
Do not open a public issue for anything exploitable.

## Assets and threats

| Asset | Threat | Control |
|---|---|---|
| Provider API keys (AISStream, FIRMS, OpenSky, Google server key) | Theft, quota/billing abuse | Kept server-side. The browser calls same-origin `/api/*` proxies and never receives these keys. |
| Browser keys (Google Maps, Cesium ion) | Abuse of a key visible in devtools | Visible by design. Must be restricted by HTTP referrer and API scope at the provider. |
| Proxy endpoints | Open relay / SSRF | Fixed upstream hosts per provider. The client never supplies an upstream URL. Inputs are validated (400 on malformed). Responses are size-capped with timeouts. Unknown routes return JSON 404. |
| Rendered UI | Script injection via feed text (AIS ship names and destinations, callsigns, place names are broadcast by anyone) | All feed strings are HTML-escaped before rendering. Regression-tested in `src/intel/markup.test.mjs`. Director captions use `textContent`. |
| Page | Clickjacking | `X-Frame-Options: DENY`, `frame-ancestors 'none'` |
| Local files | Disclosure through the dev server | `server.fs.deny` blocks `.env*`, certificates, `.git` and launcher environment files |
| Integrity of displayed information | Simulated content mistaken for real | Every value is tagged FEED or SIMULATED. Staged demo events are labelled and announced as simulated (tested). |

## Secrets handling

- `.env` and every `.env.*` variant are git-ignored. `.env.example` holds
  names only.
- Only `GOOGLE_MAPS_API_KEY` and `CESIUM_ION_TOKEN` are compiled into the
  browser bundle (`build/vite.js` `define`, tested). `GEV_BUILD` (the build
  identity) is also compiled in, but it is not a secret.
- Launch scripts and the setup doctor report whether a key is set, never its
  value (tested).
- Git history was reviewed on 2026-10-14. It contains no real credentials,
  only test fixtures such as `sk-fixture-only-not-a-real-key`.

## Network exposure

The server is a **key broker**. Anyone who can reach it can spend the
configured providers' quotas.

- **Local default:** binds to `localhost` and accepts only local host
  headers. `HOST=0.0.0.0` is an explicit opt-in and prints a warning.
- **Hosted demo (Replit):** the URL is reachable from the internet, so
  anyone with the link can use the proxies. Treat the link as confidential.
  Set `GEV_RATELIMIT_GOOGLE_PER_MIN`, and set provider-side budgets and
  quotas (Google Cloud budgets, AISStream and FIRMS limits). For anything
  beyond a demo, put it behind authentication.
- The optional per-IP throttle is in-memory and process-local. It is **not**
  a billing cap.

## Known gaps (open)

1. No authentication or authorisation. Every viewer has full access.
2. No Content-Security-Policy beyond `frame-ancestors`. The app uses inline
   HTML templates. A script-src policy is a recommended hardening step.
3. Upstream availability depends on free public services: rate limits, terms
   changes and outages (see [KNOWN-LIMITATIONS.md](docs/KNOWN-LIMITATIONS.md)).
4. No dependency vulnerability scanning in CI yet. Recommended: `npm audit` and
   Dependabot.
5. No independent security review or penetration test.

## Responsible use

Everything shown comes from public sources, or is labelled simulated. Do not
present public-data inference as authoritative intelligence. The system holds
no dossiers on natural persons. Live mode offers no kinetic actions. Exercise
mode is a fictional theatre that reads no live data.
