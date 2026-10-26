# Incident Response Procedure

This document defines who is contacted, and how incidents are triaged,
contained, and reviewed for God's Eye View.

---

## 1. Scope

An **incident** is any unplanned event that degrades service availability,
compromises data integrity or confidentiality, or violates a security policy.
Examples: unauthorised access, data exposure, sustained API outage, production
crash loop.

---

## 2. Severity Levels

| Severity | Criteria | Initial Response Target |
|---|---|---|
| **P1 – Critical** | Data breach, system unavailable, active exploitation | 15 minutes |
| **P2 – High** | Significant feature degradation, security anomaly | 1 hour |
| **P3 – Medium** | Partial degradation, non-critical component down | 4 hours (business hours) |
| **P4 – Low** | Minor issue, workaround available | Next business day |

---

## 3. On-Call Contacts

| Role | Responsibility | Contact |
|---|---|---|
| **Primary on-call engineer** | First responder; triages and coordinates | Defined in team rotation schedule |
| **Security lead** | Consulted for P1/P2 security events | security@[org-domain] |
| **Engineering manager** | Escalation point for P1; external communications | Defined in escalation runbook |
| **Legal / DPO** | Notified within 72 h of any personal-data breach | legal@[org-domain] |

Update the rotation schedule in the internal on-call tool (e.g., PagerDuty,
OpsGenie) and keep contacts current.

---

## 4. Detection & Alerting

- Structured security logs (sign-in failures, auth errors, unhandled exceptions)
  are emitted by `server/logger.js` in NDJSON format.
- Configure the log aggregation pipeline to alert on:
  - `event: "sign_in_failure"` rate > 5 / minute
  - `event: "uncaught_exception"` or `event: "unhandled_rejection"`
  - HTTP 5xx response rate > 1 %

---

## 5. Triage

1. **Acknowledge** the alert in the on-call tool within the response target.
2. **Classify** severity using the table above.
3. **Assess impact**: number of users affected, data categories involved,
   whether the incident is ongoing.
4. **Open an incident channel** (e.g., `#inc-YYYY-MM-DD-<slug>`) and post
   initial findings within 30 minutes of acknowledgement for P1/P2.

---

## 6. Containment

| Action | When |
|---|---|
| Revoke / rotate compromised credentials (JWT secret, API keys) | Immediately on suspected compromise |
| Block offending IP at reverse-proxy / firewall | Active attack detected |
| Disable affected endpoint (return 503) | Data integrity risk |
| Scale down / restart crashed service | Crash loop |
| Notify affected users / customers | Personal data exposed |

Document every containment action with timestamp and actor in the incident
channel.

---

## 7. Eradication & Recovery

1. Identify root cause from structured logs and error traces.
2. Apply fix in a feature branch; require peer review even under time pressure.
3. Deploy to staging; smoke-test the affected path.
4. Deploy to production; monitor error rates for 30 minutes post-deploy.
5. Lift any temporary containment measures (IP blocks, disabled endpoints).

---

## 8. Post-Incident Review (Postmortem)

A blameless postmortem must be completed within **5 business days** of any P1
or P2 incident (and optionally for P3).

**Postmortem document must include:**

- Incident timeline (UTC timestamps)
- Root cause analysis
- Impact summary (duration, users affected, data categories involved)
- What went well
- What went wrong
- Action items with owners and due dates

Store postmortem documents in `docs/postmortems/YYYY-MM-DD-<slug>.md`.

---

## 9. Regulatory Notification

If personal data is involved:

- **GDPR (EU/UK):** Notify the supervisory authority within **72 hours** of
  becoming aware of the breach (Article 33 GDPR). Notify affected data subjects
  without undue delay if high risk (Article 34 GDPR).
- Contact the DPO immediately; do not wait for full root-cause analysis.

---

## 10. Document History

| Date | Author | Change |
|---|---|---|
| 2026-10-26 | Maintainer | Initial version |
