# Hazard Log — God's Eye View

**System:** God's Eye View real-time intelligence console  
**Version:** 0.1.1  
**Owner:** Engineering  
**Last reviewed:** 2026-10-25  
**Status legend:** Open · Mitigated · Accepted · Closed

---

## Safety Case Summary

God's Eye View aggregates public and semi-public geospatial feeds (ADS-B, AIS,
satellite TLE, CCTV, FIRMS, METAR) and presents them on a 3-D globe in a
browser. The system is a read-only visualisation console; it does not issue
commands to aircraft, vessels, or any physical infrastructure. The principal
harms it could cause are therefore informational rather than physical:
unauthorised disclosure of sensitive tracking data, and denial-of-service
through resource exhaustion.

The safety argument is:

1. **Authentication gate** — every API endpoint is protected by a JWT
   bearer-token check (`server/auth/middleware.js`). Unauthenticated requests
   receive a 401 before any provider data is read.

2. **Multi-factor authentication** — when `TOTP_SECRET` is set, the login
   handler additionally calls `totp.verify()` against an RFC 6238 one-time
   password, raising the barrier for credential theft.

3. **Role-based authorisation** — `requireRole()` / `hasPermission()` in
   `server/auth/roles.js` enforce least-privilege access; sensitive military
   feeds require the `operator` role, administrative actions require `admin`.

4. **Rate-limiting and proxy isolation** — upstream API keys are held
   server-side and never sent to browsers. `server/providers/common/rate-limit.js`
   caps outbound request rates to avoid abusing upstream services.

5. **No command pathway** — the application has no actuator, no write API to
   any physical system, and no autonomous decision loop; the worst-case failure
   is a stale or missing map overlay.

These controls collectively argue that the risk to individuals is low and
residual risks are accepted by the operator.

---

## Hazard Register

| ID    | Hazard | Cause | Effect | Severity | Mitigation | Status |
|-------|--------|-------|--------|----------|------------|--------|
| H-001 | Unauthorised access to live tracking data | Stolen or absent session credential | Adversary monitors private aircraft/vessel movements | High | JWT authentication + TOTP MFA on login endpoint | Mitigated |
| H-002 | Exposure of server-side API keys | Server-side code or config leak | Upstream quota exhausted; billing fraud | High | Keys held only in server env vars; never sent to browser; `.env` excluded from VCS | Mitigated |
| H-003 | Privilege escalation via role tampering | JWT payload modified by client | User accesses military or admin endpoints | High | JWT is HMAC-signed; `jwt.verify()` rejects modified tokens | Mitigated |
| H-004 | Denial-of-service via excessive API polling | Abusive client or misconfiguration | Upstream provider rate-limits or bills for excess | Medium | Server-side rate limiter (`rate-limit.js`); auth gate blocks unauthenticated bulk requests | Mitigated |
| H-005 | Cross-site scripting through injected CCTV metadata | Malicious stream title or description from upstream | User browser executes injected script | Medium | Data rendered via CesiumJS entity labels which are text-only; no `innerHTML` assignments in provider code | Mitigated |
| H-006 | Stale or incorrect map data leading to wrong situational picture | Upstream provider outage or delayed data | Operator acts on outdated information | Medium | Data timestamps shown in UI; staleness warnings displayed; system is advisory only | Accepted |
| H-007 | Browser crash / GPU hang on large datasets | Excessive entity count in CesiumJS scene | Loss of monitoring view for operator | Low | LOD controls and entity-count caps per layer | Mitigated |
| H-008 | Personal data exposure (vessel/flight PII) | Aggregation of public ADS-B/AIS with identity databases | Privacy violation | Medium | No identity enrichment beyond public callsign/MMSI; privacy policy documents this | Accepted |
| H-009 | TOTP secret compromise | Secret stored insecurely or leaked | MFA bypass | High | Secret stored in environment variable, not in code; rotate via `TOTP_SECRET` env var | Open |
| H-010 | Session fixation / replay attack | JWT stolen from network | Attacker reuses token | Medium | Short token lifetime (1 h); HTTPS enforced in production; `Secure; HttpOnly` cookie recommended | Open |

---

## Review History

| Date | Reviewer | Changes |
|------|----------|---------|
| 2026-10-25 | Engineering | Initial hazard log created |
