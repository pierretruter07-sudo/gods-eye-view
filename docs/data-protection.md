# Data Protection Notes

This document records what personal and sensitive data God's Eye View handles,
where it is stored, and how long it is retained.

---

## 1. Data Inventory

| Category | Data Elements | Purpose | Legal Basis |
|---|---|---|---|
| Authentication credentials | Admin username, hashed password, TOTP secret | Server access control | Legitimate interest |
| Session tokens | Signed JWT (sub, role, exp) | Stateless session management | Legitimate interest |
| IP addresses / request metadata | Source IP, HTTP method, path, timestamp | Security audit logging | Legitimate interest |
| External API keys | Google Maps API key, Cesium Ion token, OpenSky credentials | Third-party data access | Contractual necessity |
| Aircraft transponder data | ICAO hex, callsign, position, altitude, speed | Live flight display | Public domain / ADS-B |
| Vessel AIS data | MMSI, vessel name, position, speed, heading | Live maritime display | Public domain / AIS |
| User-entered search queries | Location names typed in the search box | Map navigation | Legitimate interest |

---

## 2. Storage Locations

| Data | Storage Location | Encryption at Rest |
|---|---|---|
| Admin credentials | Environment variables (`.env` file, not committed to VCS) | OS file-system permissions; encrypt `.env` at rest in production |
| JWT tokens | HTTP-only cookies or `Authorization` header (in transit only) | TLS in transit; not persisted server-side |
| Structured logs | stdout / log aggregation pipeline (e.g., Loki, CloudWatch) | Depends on hosting environment |
| Live flight & vessel data | In-memory cache only | N/A — not persisted |
| External API keys | Environment variables | OS file-system permissions; use a secrets manager in production |

No database or persistent user data store is used by this application.
All real-time data (flights, vessels, satellites) is fetched from upstream APIs
on demand and held only in transient in-memory caches.

---

## 3. Retention Periods

| Data | Retention Period | Justification |
|---|---|---|
| Structured security logs (sign-ins, auth failures) | 90 days | Sufficient for security investigation; balance with minimisation |
| Error logs | 30 days | Debugging window |
| Live ADS-B / AIS cache | ≤ 60 seconds (in-memory TTL) | Real-time display only |
| JWT tokens | 1 hour (exp claim) | Short-lived session |
| `.env` credentials | Until rotated (review quarterly) | Operational necessity |

Log pipelines must be configured to apply these retention periods via their
native policies (e.g., CloudWatch log group retention, Loki compactor rules).

---

## 4. Third-Party Sub-Processors

| Processor | Data Shared | Purpose |
|---|---|---|
| Google Maps Platform | User location search queries, map tile requests | Geocoding and 3D tiles |
| Cesium Ion | Terrain tile requests | Photorealistic terrain |
| OpenSky Network | ADS-B queries (IP, query parameters) | Live flight data |
| ADS-B Exchange / adsb.lol | ADS-B queries | Live flight fallback |
| AIS-catcher / marine APIs | Vessel queries | Live vessel data |

Refer to each provider's privacy policy for their data handling practices.

---

## 5. Data Subject Rights

This application is an internal operations tool. It does not hold personal data
about end-users beyond authentication credentials for the single administrator
account. Should a data subject request erasure or access, delete or rotate the
relevant environment variables and purge associated log entries.

---

## 6. Risk & Review

- **Risk owner:** Application maintainer  
- **Review cycle:** Annually, or after any material change to data flows  
- **Last reviewed:** 2026-10-26  
- **Next review due:** 2027-10-26  
