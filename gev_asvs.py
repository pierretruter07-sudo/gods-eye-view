"""God's Eye View rated against OWASP ASVS 5.0.0 at Level 2 (L1 + L2 rows).

Ratings come from a code review of commit-era main (Oct 2026): server/providers,
build/vite.js, SECURITY.md, CI workflow. Hosting-dependent rows (Replit edge TLS
and redirects) are left unrated on purpose: not verifiable from the code.

Each entry: id -> (status, evidence, note, severity). Severity only for P/N:
SC critical, SH high, SM medium, SL low.
"""

NA_CHAPTERS = {
    'V5': 'No file upload, download-by-name or archive handling anywhere in the app.',
    'V6': 'No authentication: no accounts, passwords, MFA or IdP. Gap tracked under V8.2.1.',
    'V7': 'No sessions or session tokens; no cookies are set.',
    'V9': 'No self-contained tokens (JWT etc.) are issued or accepted.',
    'V10': 'No OAuth or OIDC client, resource server or authorization server.',
    'V11': 'No application-level cryptography; TLS is provided by Node and the hosting edge.',
    'V17': 'No WebRTC, TURN or media server.',
}
NA_SECTIONS = {
    'V1.4': 'JavaScript runtime is memory-safe; no native code.',
    'V3.3': 'The app sets no cookies.',
    'V4.3': 'No GraphQL.',
    'V12.3': None,  # rated per row below
}

R = {
    # V1 Encoding and sanitization
    'V1.1.1': ('L', 'Server decodes query strings once via URL/URLSearchParams before validation.', 'Document the canonical-decode rule in the validation spec.', None),
    'V1.1.2': ('L', 'Intel HUD escapes at render time with esc(); textContent elsewhere.', 'Confirm the 12 innerHTML sinks all escape at the last step.', None),
    'V1.2.1': ('L', 'esc() for HTML element/attribute context; src/intel/markup.test.mjs injection tests.', 'Add a lint rule or test sweep covering all 12 innerHTML sinks.', None),
    'V1.2.2': ('L', 'Upstream URLs built with URL/URLSearchParams/encodeURIComponent (31 call sites).', None, None),
    'V1.2.3': ('C', 'All API responses built with JSON.stringify; no string-built JSON or JS.', None, None),
    'V1.2.4': ('NA', 'No database or query language.', None, None),
    'V1.2.5': ('C', 'No OS calls at runtime; execFileSync only in the build config (git rev-parse, fixed args).', None, None),
    'V1.2.6': ('NA', 'No LDAP.', None, None),
    'V1.2.7': ('NA', 'No XPath.', None, None),
    'V1.2.8': ('NA', 'No LaTeX.', None, None),
    'V1.2.9': ('L', 'Search filters use plain substring matching; no user-built regular expressions found.', None, None),
    'V1.3.1': ('NA', 'No WYSIWYG or user-authored HTML.', None, None),
    'V1.3.2': ('C', 'No eval() or new Function() in src/ or server/ (grep, Oct 2026).', None, None),
    'V1.3.3': ('L', 'Feed strings treated as untrusted and escaped; coordinates and IDs parsed to numbers/hex before use.', None, None),
    'V1.3.4': ('NA', 'No user-supplied SVG; SVGs are first-party (silhouettes, logo).', None, None),
    'V1.3.5': ('NA', 'No user-supplied Markdown, CSS or templates.', None, None),
    'V1.3.6': ('L', "Proxies call fixed upstream hosts only; no endpoint accepts a URL; fetches use redirect:'error'.", 'Add an explicit outbound host allowlist test.', None),
    'V1.3.7': ('NA', 'No server-side templating of untrusted input.', None, None),
    'V1.3.8': ('NA', 'No JNDI.', None, None),
    'V1.3.9': ('NA', 'No memcache.', None, None),
    'V1.3.10': ('L', 'No printf-style format strings fed by untrusted data.', None, None),
    'V1.3.11': ('NA', 'No mail system.', None, None),
    'V1.5.1': ('NA', 'No XML parsing of untrusted data (DOMParser used only on the first-party logo SVG).', None, None),
    'V1.5.2': ('C', 'Only JSON.parse of upstream data; no object deserialization or type hints.', None, None),

    # V2 Validation and business logic
    'V2.1.1': ('P', 'Validation exists in code (400 on bad hex, callsign, coordinates, cyclone query) but rules are not documented.', 'Write an input-validation spec per API endpoint (types, ranges, lengths).', 'SM'),
    'V2.1.2': ('P', 'Combined-field checks exist in code (bbox, route coords); not documented.', 'Add to the validation spec.', 'SL'),
    'V2.1.3': ('P', 'Rate limits and provider budgets described in CONFIGURATION-INDEX; no per-client/global limit policy.', 'Document per-client and global limits for each cost-bearing proxy.', 'SM'),
    'V2.2.1': ('L', 'Positive validation on IDs (hex, callsign regex), numeric ranges on lat/lon/zoom; 400 responses.', 'Cover remaining endpoints in tests.', None),
    'V2.2.2': ('C', 'All validation enforced server-side in server/providers; client checks are UX only.', None, None),
    'V2.2.3': ('L', 'Route and bbox combinations bounded (coordinate count, area).', None, None),
    'V2.3.1': ('NA', 'No multi-step business flows.', None, None),
    'V2.3.2': ('P', 'Limits exist but per-IP rate limiting is opt-in and off by default.', 'Turn rate limiting on by default in production config.', 'SM'),
    'V2.3.3': ('NA', 'No transactional operations.', None, None),
    'V2.3.4': ('NA', 'No limited-quantity resources.', None, None),
    'V2.4.1': ('P', 'Opt-in per-IP limiter (default unlimited); cost-bearing Google proxies callable by anyone with the URL.', 'Enable limits by default; add global quota caps and alerting on provider spend.', 'SH'),

    # V3 Web frontend
    'V3.2.1': ('P', 'API responses set Content-Type; no X-Content-Type-Options or CSP sandboxing.', 'Add nosniff and a CSP (see V3.4.3, V3.4.4).', 'SM'),
    'V3.2.2': ('L', 'Text rendered with textContent or esc(); markup tests cover hostile feed strings.', None, None),
    'V3.4.1': ('N', 'No Strict-Transport-Security header set by the app; edge behaviour on Replit unverified.', 'Set HSTS (max-age >= 1 year) in server headers or at the edge.', 'SM'),
    'V3.4.2': ('L', 'Vite 6 default CORS (localhost origins only); no wildcard Access-Control-Allow-Origin.', 'Set an explicit CORS policy for production.', None),
    'V3.4.3': ('N', "CSP is frame-ancestors only; no script-src/object-src/base-uri (SECURITY.md known gap 2).", 'Ship a script-src CSP (nonces or hashes) after moving inline HTML templates.', 'SH'),
    'V3.4.4': ('N', 'X-Content-Type-Options: nosniff not set.', 'Add nosniff to server.headers.', 'SM'),
    'V3.4.5': ('P', 'No explicit Referrer-Policy; browser default strict-origin-when-cross-origin applies.', 'Set Referrer-Policy: strict-origin-when-cross-origin explicitly.', 'SL'),
    'V3.4.6': ('C', "frame-ancestors 'none' plus X-Frame-Options DENY on every response (build/vite.js; viteBuild test).", None, None),
    'V3.5.1': ('L', 'No state-changing functions; quota-burn via cross-site calls tracked under V2.4.1.', None, None),
    'V3.5.2': ('NA', 'Does not rely on CORS preflight for protection.', None, None),
    'V3.5.3': ('C', 'Read-only GET endpoints; Places proxy rejects other methods (405).', None, None),
    'V3.5.4': ('C', 'Single application on its own hostname.', None, None),
    'V3.5.5': ('NA', 'No postMessage listeners.', None, None),
    'V3.7.1': ('C', 'Current CesiumJS and evergreen browsers; no Flash, Java or similar.', None, None),
    'V3.7.2': ('C', 'No automatic redirects to external hosts.', None, None),

    # V4 API and web service
    'V4.1.1': ('L', 'JSON and text responses set Content-Type; charset not always explicit.', 'Add charset=utf-8 to JSON responses.', None),
    'V4.1.3': ('C', 'Rate limiter keys on socket address and ignores client-supplied X-Forwarded-For.', None, None),
    'V4.2.1': ('L', 'Node http parser handles message boundaries; request bodies size-capped (Overpass 24 KB).', None, None),
    'V4.4.1': ('C', 'Only WebSocket is server-side to wss://stream.aisstream.io; key never reaches the browser.', None, None),
    'V4.4.2': ('NA', 'No inbound WebSocket endpoint.', None, None),
    'V4.4.3': ('NA', 'No inbound WebSocket endpoint.', None, None),
    'V4.4.4': ('NA', 'No inbound WebSocket endpoint.', None, None),

    # V8 Authorization (the headline gap)
    'V8.1.1': ('N', 'No authorization model documented; the app is public-by-design (SECURITY.md known gap 1).', 'Define roles (viewer, operator, admin) and which functions each may use.', 'SH'),
    'V8.1.2': ('NA', 'No field-level data restrictions needed (public data only).', None, None),
    'V8.2.1': ('N', 'Every function, including cost-bearing API proxies and Exercise mode, is open to anyone with the URL.', 'Put authentication (SSO/OIDC) in front of the app before any non-public deployment.', 'SH'),
    'V8.2.2': ('NA', 'No per-user data items.', None, None),
    'V8.2.3': ('NA', 'No per-field permissions.', None, None),
    'V8.3.1': ('NA', 'No authorization rules exist to enforce (see V8.2.1).', None, None),
    'V8.4.1': ('NA', 'Single tenant.', None, None),

    # V12 Secure communication
    'V12.1.3': ('NA', 'No mTLS.', None, None),
    'V12.2.1': ('L', 'Served over HTTPS on Replit; HTTP fallback behaviour at the edge not verified.', 'Confirm HTTP->HTTPS redirect and HSTS at the edge.', None),
    'V12.2.2': ('C', 'Replit-managed publicly trusted certificate.', None, None),
    'V12.3.1': ('C', 'All upstream calls use https:// or wss:// (grep of server/providers).', None, None),
    'V12.3.2': ('C', 'Node default certificate validation; NODE_TLS_REJECT_UNAUTHORIZED not overridden.', None, None),
    'V12.3.3': ('NA', 'Single process; no internal HTTP services.', None, None),
    'V12.3.4': ('NA', 'No internal services.', None, None),

    # V13 Configuration
    'V13.1.1': ('L', 'docs/DATA_SOURCES.md lists every upstream with licence flags; failure behaviour in KNOWN-LIMITATIONS.', None, None),
    'V13.2.1': ('NA', 'No backend-to-backend components.', None, None),
    'V13.2.2': ('NA', 'No backend components or data layers.', None, None),
    'V13.2.3': ('NA', 'Only third-party API keys; no default credentials.', None, None),
    'V13.2.4': ('L', 'Upstream hosts hard-coded per provider; no generic fetch endpoint.', 'Centralise the host list as an explicit allowlist.', None),
    'V13.2.5': ('P', 'No egress restriction at the server or platform level.', 'Restrict outbound egress to the documented hosts where hosting allows.', 'SL'),
    'V13.3.1': ('P', 'Secrets in Replit Secrets/env; .env.example names only; no vault, rotation or expiry.', 'Move to a managed secret store with rotation for the production deployment.', 'SM'),
    'V13.3.2': ('P', 'Server keys stay server-side, but GOOGLE_MAPS_API_KEY and CESIUM_ION_TOKEN are bundled to the browser by design.', 'Restrict browser keys by HTTP referrer and API; verify in the Google and Cesium consoles.', 'SM'),
    'V13.4.1': ('C', 'Production serves dist/ only via vite preview; fs.deny blocks .git, .env, keys.', None, None),
    'V13.4.2': ('L', 'Production uses vite preview (no dev server/HMR); ?fps overlay remains available.', 'Gate ?fps and debug handles behind a build flag.', None),
    'V13.4.3': ('C', 'No directory listings (sirv static server).', None, None),
    'V13.4.4': ('L', 'Node http has no TRACE handler; unhandled methods fall through to static/404.', 'Reject TRACE explicitly.', None),
    'V13.4.5': ('P', 'window.__godsEyeView debug handle exposed in production builds.', 'Remove or gate the debug handle in production.', 'SL'),

    # V14 Data protection
    'V14.1.1': ('N', 'No data classification. Public OSINT, but aggregated military tracks may be sensitive to a defence customer.', 'Classify data (public, aggregated-sensitive, simulated) and record handling rules.', 'SM'),
    'V14.1.2': ('N', 'No protection requirements per level.', 'Define per-class requirements (retention, caching, export).', 'SM'),
    'V14.2.1': ('L', 'No user data; our URLs carry no secrets (Google Maps JS loads its browser key by design).', None, None),
    'V14.2.2': ('NA', 'No sensitive data defined (see V14.1.1).', None, None),
    'V14.2.3': ('C', 'No analytics or third-party trackers.', None, None),
    'V14.2.4': ('NA', 'No sensitive data defined.', None, None),
    'V14.3.1': ('NA', 'No authenticated data.', None, None),
    'V14.3.2': ('NA', 'No sensitive responses.', None, None),
    'V14.3.3': ('C', 'localStorage holds layer preferences only.', None, None),

    # V15 Secure coding and architecture
    'V15.1.1': ('N', 'No documented remediation time frames for vulnerable components.', 'Add a patch SLA to SECURITY.md (e.g. critical 7 days, high 30).', 'SM'),
    'V15.1.2': ('N', 'No SBOM; package-lock.json only.', 'Generate a CycloneDX SBOM in CI and keep it with each release.', 'SM'),
    'V15.1.3': ('P', 'KNOWN-LIMITATIONS and provider budgets cover upstream cost; no list of resource-heavy endpoints.', 'Document heavy endpoints (Overpass, routes, tracks) and their limits.', 'SL'),
    'V15.2.1': ('N', 'No dependency vulnerability scanning in CI (SECURITY.md known gap 4); state cannot be shown.', 'Add npm audit and Dependabot; fail CI on high/critical.', 'SH'),
    'V15.2.2': ('L', 'Capped upstream reads (readCappedResponseText), timeouts, caches, request coalescing.', None, None),
    'V15.2.3': ('L', 'Exercise mode is fictional and labelled; debug overlays remain (see V13.4.5).', None, None),
    'V15.3.1': ('L', 'Most proxies reshape upstream payloads to required fields; some pass through.', 'Trim pass-through responses.', None),
    'V15.3.2': ('L', "redirect:'error' on most outbound fetches.", 'Apply to every outbound fetch.', None),
    'V15.3.3': ('NA', 'No object binding from requests.', None, None),
    'V15.3.4': ('P', 'Limiter ignores X-Forwarded-For, so behind the Replit proxy every client may share one bucket.', "Trust the platform's forwarded header only from the known proxy hop.", 'SM'),
    'V15.3.5': ('L', 'Strict equality and Number.isFinite checks on parsed inputs.', None, None),
    'V15.3.6': ('L', 'Map/Set for keyed state in hot paths; some object-literal lookups keyed by feed data.', 'Use Map or Object.create(null) where keys come from feeds.', None),
    'V15.3.7': ('L', 'searchParams.get() takes the first value; duplicate params ignored.', None, None),

    # V16 Logging and error handling
    'V16.1.1': ('N', 'No log inventory.', 'Document what each layer logs, where, and retention.', 'SM'),
    'V16.2.1': ('P', 'console.warn/error lines carry provider and reason, but no structured when/where metadata.', 'Adopt structured JSON logs with timestamp and request id.', 'SL'),
    'V16.2.2': ('P', 'Relies on platform timestamps; no explicit UTC in log lines.', 'Emit ISO-8601 UTC timestamps.', 'SL'),
    'V16.2.3': ('L', 'Logs go to stdout only.', None, None),
    'V16.2.4': ('P', 'Free-text console logs; no common format.', 'Use JSON lines.', 'SL'),
    'V16.2.5': ('L', 'API keys are never logged (key names only in error messages).', None, None),
    'V16.3.1': ('NA', 'No authentication operations.', None, None),
    'V16.3.2': ('NA', 'No authorization decisions.', None, None),
    'V16.3.3': ('N', 'No security events defined or logged (rate-limit hits, validation rejects).', 'Log rate-limit and validation rejects as security events.', 'SM'),
    'V16.3.4': ('L', 'Upstream failures and TLS errors logged via console.warn with provider context.', None, None),
    'V16.4.1': ('P', 'Some feed-derived strings logged without encoding.', 'Encode or JSON-stringify untrusted values in logs.', 'SL'),
    'V16.4.2': ('P', 'Logs protected only by platform access control; not tamper-evident.', 'Ship logs to an append-only store.', 'SL'),
    'V16.4.3': ('N', 'No log shipping to a separate system.', 'Forward logs to a SIEM or log service with alerting.', 'SM'),
    'V16.5.1': ('L', 'Generic error strings returned (invalid hex, rate limit exceeded); no stack traces.', 'Review route-error passthrough of upstream messages.', None),
    'V16.5.2': ('C', 'Fallbacks, AIS watchdog, retryable loads and degraded states when feeds fail.', None, None),
    'V16.5.3': ('L', 'Invalid input rejected before processing; failures render an empty layer, not stale-as-fresh.', None, None),
}
# Hosting-dependent: left unrated (not verifiable from the code).
UNRATED = {'V4.1.2', 'V12.1.1', 'V12.1.2'}


def rate(asvs):
    """Return {req_id: rating dict} for every L1/L2 requirement."""
    out = {}
    for x in asvs:
        if x['L'] > 2:
            continue
        rid = x['id']
        if rid in UNRATED:
            continue
        if rid in R:
            s, ev, note, sev = R[rid]
        elif x['ch'] in NA_CHAPTERS:
            s, ev, note, sev = 'NA', NA_CHAPTERS[x['ch']], None, None
        elif x['sec'] in NA_SECTIONS and NA_SECTIONS[x['sec']]:
            s, ev, note, sev = 'NA', NA_SECTIONS[x['sec']], None, None
        else:
            raise SystemExit(f'unrated L{x["L"]} requirement {rid}')
        r = {'status': s, 'evidence': ev}
        if note:
            r['note'] = note
        if sev:
            r['severity'] = sev
        out[rid] = r
    return out
