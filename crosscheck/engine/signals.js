/**
 * @file CrossCheck evidence signals: what can be learned about a codebase by
 * reading its files. Each signal looks for one kind of evidence (a test
 * suite, a lock file, a hard-coded secret, a security policy...) and returns
 * a result with the exact files and lines it relied on, so every rating can
 * cite its evidence.
 *
 * Pure: the input is a snapshot of the repository's files (paths, sizes and
 * the text of text files); nothing here touches the network or the disk.
 * @module crosscheck/engine/signals
 */

/** Result states, best first. */
export const PASS = 'pass';
export const PARTIAL = 'partial';
export const FAIL = 'fail';
/** The thing a signal checks does not exist here (e.g. no container). */
export const NOT_APPLICABLE = 'na';

/** Plan themes (workstreams), in the order a team usually tackles them. */
export const THEMES = Object.freeze({
  secrets: 'Secrets and configuration',
  appsec: 'Application security controls',
  access: 'Identity and access',
  supply: 'Dependencies and supply chain',
  build: 'Build, CI and release',
  testing: 'Testing and verification',
  logging: 'Logging, monitoring and errors',
  docs: 'Requirements, design and records',
  safety: 'Hazards and safety case',
  ops: 'Operations and incident response',
  governance: 'Ownership and governance',
  ai: 'AI management',
});

const TEXT_EXT =
  /\.(m?[jt]sx?|cjs|py|rb|go|rs|java|kt|kts|scala|cs|php|swift|c|cc|cpp|h|hpp|m|sh|bash|ps1|ya?ml|toml|ini|cfg|conf|json|md|mdx|rst|txt|html?|css|scss|vue|svelte|sql|tf|hcl|gradle|xml|properties|env|example|lock|dockerfile)$/i;
const CODE_EXT =
  /\.(m?[jt]sx?|cjs|py|rb|go|rs|java|kt|scala|cs|php|swift|c|cc|cpp|vue|svelte)$/i;
const VENDOR =
  /(^|\/)(node_modules|vendor|third_party|dist|\.git|\.claude|\.venv|venv|__pycache__|coverage|\.next)\//i;

const base = (p) => p.split('/').pop();
const lower = (p) => p.toLowerCase();

/** Whether a path is a text file CrossCheck reads (by name). */
export function isTextPath(path) {
  const b = lower(base(path));
  return (
    TEXT_EXT.test(b) ||
    /^(dockerfile|makefile|jenkinsfile|procfile|codeowners|license|licence|readme|changelog|security|notice|\.gitignore|\.dockerignore|\.env[\w.-]*)$/i.test(
      b,
    )
  );
}

/**
 * Index a snapshot once for all signals.
 * @param {{files: Array<{path: string, size: number, text?: string|null}>}} snapshot
 */
export function indexSnapshot(snapshot) {
  const files = (snapshot?.files || []).filter(
    (f) => f && typeof f.path === 'string' && !VENDOR.test(`${f.path}/`),
  );
  const byPath = new Map(files.map((f) => [f.path, f]));
  const code = files.filter((f) => CODE_EXT.test(f.path));
  const tests = code.filter((f) => isTestPath(f.path));
  return {
    files,
    byPath,
    code,
    tests,
    source: code.filter((f) => !isTestPath(f.path)),
    // CrossCheck's own detector modules name every pattern they look for;
    // they are never evidence about the code being assessed.
    texts: files.filter(
      (f) => typeof f.text === 'string' && !f.text.includes('@module crosscheck/'),
    ),
  };
}

/** Test files by the usual naming conventions. */
export function isTestPath(path) {
  const p = lower(path);
  return (
    /(^|\/)(tests?|__tests__|spec|specs|e2e|test_\w+)\//.test(p) ||
    /\.(test|spec)\.[a-z]+$/.test(p) ||
    /(^|\/)test_[^/]+\.py$/.test(p) ||
    /_test\.(go|py|rb|rs)$/.test(p) ||
    /tests?\.(rs|cs|java|kt)$/.test(p)
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────

/** Files whose path matches. */
const filesMatching = (ix, re) => ix.files.filter((f) => re.test(f.path));

/**
 * Whether a match sits inside a quoted sentence (prose that mentions a
 * control, such as a message or a description) rather than in code.
 */
export function inProse(line, re) {
  const m = re.exec(line);
  if (!m) return false;
  const at = m.index;
  for (const s of line.matchAll(/(['"`])((?:\\.|(?!\1).)*)\1/g)) {
    const start = s.index;
    const end = start + s[0].length;
    if (at >= start && at < end && (s[2].match(/\s+/g) || []).length >= 3)
      return true;
  }
  return false;
}

/** First matching line in each text file (capped), as evidence. */
function grep(ix, re, { only = null, max = 6, exclude = null, code = false } = {}) {
  const hits = [];
  for (const f of ix.texts) {
    if (only && !only.test(f.path)) continue;
    if (exclude && exclude.test(f.path)) continue;
    const lines = f.text.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      // A line holding a regular expression is a pattern, not a use (this
      // also stops CrossCheck finding its own detectors in its source).
      if (
        re.test(lines[i]) &&
        !/\\b|\\s\*|\(\?:/.test(lines[i]) &&
        // In code mode, comments and quoted sentences mention a control;
        // they are not the control.
        !(code && /^\s*(\/\/|#|\*|\/\*|<!--|--)/.test(lines[i])) &&
        !(code && inProse(lines[i], new RegExp(re.source, re.flags.replace('g', ''))))
      ) {
        hits.push({ path: f.path, line: i + 1, text: clip(lines[i]) });
        break;
      }
    }
    if (hits.length >= max) break;
  }
  return hits;
}

const clip = (s, n = 140) => {
  const t = String(s).trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

const ev = (path, note, line = null) => ({ path, note, line });
const found = (files, note) => files.slice(0, 6).map((f) => ev(f.path, note));
const result = (state, evidence, summary) => ({ state, evidence, summary });

/** Pass when any file matches the path pattern. */
const docSignal = (re, what) => (ix) => {
  const hit = filesMatching(ix, re);
  return hit.length
    ? result(PASS, found(hit, what), `${what}: ${hit[0].path}`)
    : result(FAIL, [], `No ${what.toLowerCase()} found`);
};

/** Pass when a content pattern appears in code or config. */
const codeSignal =
  (re, what, opts = {}) =>
  (ix) => {
    const hits = grep(ix, re, { code: true, ...opts });
    return hits.length
      ? result(
          PASS,
          hits.map((h) => ev(h.path, h.text, h.line)),
          `${what}: ${hits.length} place${hits.length === 1 ? '' : 's'}`,
        )
      : result(FAIL, [], `No ${what.toLowerCase()} found`);
  };

const ONLY_CODE = /\.(m?[jt]sx?|cjs|py|rb|go|rs|java|kt|cs|php|vue|svelte)$/i;
/** Build and pipeline files: where a tool that runs on every change is set up. */
const ONLY_BUILD =
  /((^|\/)(\.github\/workflows\/[^/]+\.ya?ml|\.gitlab-ci\.yml|azure-pipelines\.ya?ml|jenkinsfile|\.circleci\/config\.yml|bitbucket-pipelines\.yml|makefile|package\.json|pyproject\.toml|tox\.ini|noxfile\.py|\.pre-commit-config\.yaml|justfile|taskfile\.ya?ml)|\.sh)$/i;
const NOT_TESTS = /(^|\/)(tests?|__tests__|spec)\/|\.(test|spec)\./i;

// ── Secrets ──────────────────────────────────────────────────────────────

const SECRET_PATTERNS = [
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Stripe secret key', /\bsk_live_[0-9a-zA-Z]{16,}\b/],
  [
    'Hard-coded credential',
    /\b(?:api[_-]?key|secret|passwd|password|access[_-]?token|auth[_-]?token)\b\s*[:=]\s*['"][^'"\s]{12,}['"]/i,
  ],
];
const PLACEHOLDER =
  /(example|sample|dummy|placeholder|changeme|your[_-]|xxxx|<[^>]+>|\$\{|process\.env|os\.environ|getenv|test|fake|mock)/i;

/** Show only enough of a secret to find it. */
export function redact(line) {
  return clip(line).replace(
    /(['"]?)([A-Za-z0-9_\-+/=]{8})[A-Za-z0-9_\-+/=]{4,}/g,
    '$1$2…',
  );
}

function secretsClean(ix) {
  const hits = [];
  for (const f of ix.texts) {
    if (/\.(md|lock)$/i.test(f.path) || /\.env\.example$/i.test(f.path))
      continue;
    const lines = f.text.split('\n');
    for (let i = 0; i < lines.length && hits.length < 12; i += 1) {
      const line = lines[i];
      for (const [kind, re] of SECRET_PATTERNS) {
        if (!re.test(line)) continue;
        if (kind === 'Hard-coded credential' && PLACEHOLDER.test(line)) break;
        hits.push({
          path: f.path,
          line: i + 1,
          note: `${kind}: ${redact(line)}`,
          test: isTestPath(f.path),
        });
        break;
      }
    }
  }
  const committedEnv = ix.files.filter(
    (f) =>
      /(^|\/)\.env(\.[\w-]+)?$/i.test(f.path) &&
      !/\.(example|sample|template|dist)$/i.test(f.path),
  );
  for (const f of committedEnv)
    hits.push({ path: f.path, line: null, note: 'Environment file committed' });
  if (!hits.length)
    return result(PASS, [], 'No hard-coded secrets or committed .env files');
  const real = hits.filter((h) => !h.test);
  return result(
    real.length ? FAIL : PARTIAL,
    hits.map((h) => ev(h.path, h.note, h.line)),
    real.length
      ? `${real.length} possible secret${real.length === 1 ? '' : 's'} in the code`
      : 'Possible secrets in test files only',
  );
}

function secretsIgnored(ix) {
  const gi = ix.byPath.get('.gitignore');
  if (!gi?.text) return result(FAIL, [], 'No .gitignore');
  return /(^|\n)\s*\/?\.env\b/.test(gi.text)
    ? result(PASS, [ev('.gitignore', '.env is ignored')], '.env files ignored')
    : result(
        PARTIAL,
        [ev('.gitignore', '.env not listed')],
        '.gitignore does not exclude .env',
      );
}

// ── Tests and CI ─────────────────────────────────────────────────────────

const CI_FILES =
  /(^|\/)(\.github\/workflows\/[^/]+\.ya?ml|\.gitlab-ci\.yml|azure-pipelines\.ya?ml|jenkinsfile|\.circleci\/config\.yml|bitbucket-pipelines\.yml|\.travis\.yml|buildkite\.ya?ml|\.drone\.yml)$/i;

function ciTests(ix) {
  const ci = filesMatching(ix, CI_FILES);
  if (!ci.length) return result(FAIL, [], 'No CI pipeline');
  const runs = ci.filter((f) =>
    /\b(npm (run )?test|yarn test|pnpm test|pytest|go test|cargo test|mvn (-\S+ )*(test|verify)|gradle\w* test|dotnet test|rspec|phpunit|node --test|vitest|jest|tox|make test)\b/i.test(
      f.text || '',
    ),
  );
  return runs.length
    ? result(PASS, found(runs, 'CI runs the tests'), 'CI runs the test suite')
    : result(
        PARTIAL,
        found(ci, 'CI found; no test step recognised'),
        'CI does not appear to run the tests',
      );
}

function testDepth(ix) {
  const t = ix.tests.length;
  const s = Math.max(1, ix.source.length);
  if (!t) return result(FAIL, [], 'No automated tests');
  const ratio = t / s;
  return result(
    ratio >= 0.15 ? PASS : PARTIAL,
    found(ix.tests, 'test file'),
    `${t} test file${t === 1 ? '' : 's'} for ${ix.source.length} source files (${Math.round(ratio * 100)}%)`,
  );
}

// ── Dependencies and supply chain ───────────────────────────────────────

const MANIFESTS = [
  [/(^|\/)package\.json$/, /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?)$/],
  [/(^|\/)(requirements[\w-]*\.txt|pyproject\.toml|setup\.py|Pipfile)$/, /(^|\/)(poetry\.lock|Pipfile\.lock|uv\.lock|requirements[\w-]*\.txt)$/],
  [/(^|\/)go\.mod$/, /(^|\/)go\.sum$/],
  [/(^|\/)Cargo\.toml$/, /(^|\/)Cargo\.lock$/],
  [/(^|\/)Gemfile$/, /(^|\/)Gemfile\.lock$/],
  [/(^|\/)composer\.json$/, /(^|\/)composer\.lock$/],
  [/(^|\/)(pom\.xml|build\.gradle(\.kts)?)$/, /(^|\/)(gradle\.lockfile|pom\.xml)$/],
];

function manifests(ix) {
  return MANIFESTS.map(([m, l]) => [filesMatching(ix, m), filesMatching(ix, l)]).filter(
    ([m]) => m.length,
  );
}

function depsManifest(ix) {
  const all = manifests(ix).flatMap(([m]) => m);
  return all.length
    ? result(PASS, found(all, 'dependency manifest'), `${all.length} dependency manifest(s)`)
    : result(FAIL, [], 'No dependency manifest');
}

function depsLocked(ix) {
  const m = manifests(ix);
  if (!m.length) return result(FAIL, [], 'No dependency manifest to lock');
  const locked = m.filter(([, l]) => l.length);
  const ev1 = locked.flatMap(([, l]) => found(l, 'lock file'));
  if (locked.length === m.length)
    return result(PASS, ev1, 'Every ecosystem has a lock file');
  return result(
    locked.length ? PARTIAL : FAIL,
    ev1,
    `${locked.length} of ${m.length} ecosystems have a lock file`,
  );
}

// ── Code-level security ─────────────────────────────────────────────────

function dangerousCalls(ix) {
  const hits = grep(
    ix,
    /\beval\s*\(\s*[^)\s]|new Function\s*\(\s*[^)\s]|child_process\.exec\s*\(\s*`|\bexec\s*\(\s*f?["'].*\{|os\.system\s*\(|subprocess\.\w+\([^)]*shell\s*=\s*True|pickle\.loads?\(|yaml\.load\((?![^)]*Loader)/,
    { only: ONLY_CODE, exclude: NOT_TESTS, max: 8, code: true },
  );
  const html = grep(ix, /\.innerHTML\s*=|dangerouslySetInnerHTML|v-html=/, {
    only: ONLY_CODE,
    exclude: NOT_TESTS,
    max: 8,
  });
  if (!hits.length && !html.length)
    return result(PASS, [], 'No dangerous evaluation or shell calls found');
  return result(
    hits.length ? FAIL : PARTIAL,
    [...hits, ...html].map((h) => ev(h.path, h.text, h.line)),
    hits.length
      ? `${hits.length} dangerous call site${hits.length === 1 ? '' : 's'} (eval, shell, unsafe deserialisation)`
      : `${html.length} raw HTML sink${html.length === 1 ? '' : 's'} to review`,
  );
}

function weakCrypto(ix) {
  const hits = grep(
    ix,
    /(createHash\(\s*['"](md5|sha1)['"]|hashlib\.(md5|sha1)\(|MessageDigest\.getInstance\(\s*"(MD5|SHA-?1)"|createCipheriv\(\s*['"](des|rc4|bf)[\w-]*['"]|Cipher\.getInstance\(\s*"(DES|RC4|Blowfish)|Math\.random\(\).*\b(token|secret|password|passwd|nonce|salt)\b)/i,
    { only: ONLY_CODE, exclude: NOT_TESTS, max: 8 },
  );
  return hits.length
    ? result(
        PARTIAL,
        hits.map((h) => ev(h.path, h.text, h.line)),
        `${hits.length} weak or non-cryptographic primitive${hits.length === 1 ? '' : 's'} to review`,
      )
    : result(PASS, [], 'No weak cryptographic primitives found');
}

function plainHttp(ix) {
  const hits = grep(
    ix,
    /['"`]http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|example\.|www\.w3\.org|schemas\.|json-schema)/i,
    { only: ONLY_CODE, exclude: NOT_TESTS, max: 8 },
  );
  return hits.length
    ? result(
        PARTIAL,
        hits.map((h) => ev(h.path, h.text, h.line)),
        `${hits.length} plain-HTTP endpoint${hits.length === 1 ? '' : 's'} in code`,
      )
    : result(PASS, [], 'No plain-HTTP endpoints in code');
}

function containerNonRoot(ix) {
  const docker = filesMatching(ix, /(^|\/)(Dockerfile[\w.-]*|Containerfile)$/i);
  if (!docker.length)
    return result(NOT_APPLICABLE, [], 'No container definition (does not apply)');
  const nonroot = docker.filter((f) => /^\s*USER\s+(?!root\b)\S+/im.test(f.text || ''));
  return nonroot.length === docker.length
    ? result(PASS, found(docker, 'runs as a non-root user'), 'Containers run as non-root')
    : result(
        PARTIAL,
        found(docker, 'no non-root USER'),
        'A container runs as root',
      );
}

// ── The signal list ─────────────────────────────────────────────────────

/**
 * Every signal: id, title, theme, what passing means (acceptance), the fix
 * to suggest, and the detector.
 */
export const SIGNALS = Object.freeze([
  // Records and governance
  {
    id: 'doc.readme',
    title: 'Project README',
    theme: 'docs',
    fix: 'Write a README that says what the software does, how to run it and who owns it.',
    detect: docSignal(/^readme(\.\w+)?$/i, 'README'),
  },
  {
    id: 'doc.license',
    title: 'Licence file',
    theme: 'governance',
    fix: 'Add a LICENSE file stating the terms the code is released or held under.',
    detect: docSignal(/^(licen[cs]e|copying)(\.\w+)?$/i, 'Licence'),
  },
  {
    id: 'doc.security_policy',
    title: 'Security policy and vulnerability reporting',
    theme: 'governance',
    fix: 'Add SECURITY.md: supported versions, how to report a vulnerability, and response times.',
    detect: docSignal(/(^|\/)security(\.md|\.txt|\.rst)$/i, 'Security policy'),
  },
  {
    id: 'doc.codeowners',
    title: 'Named code owners',
    theme: 'governance',
    fix: 'Add a CODEOWNERS file naming who must review each part of the code.',
    detect: docSignal(/(^|\/)CODEOWNERS$/, 'Code owners'),
  },
  {
    id: 'doc.contributing',
    title: 'Review and contribution process',
    theme: 'governance',
    fix: 'Document the change process (CONTRIBUTING.md and a pull request template): review, approval and testing before merge.',
    detect: docSignal(
      /(^|\/)(contributing(\.md)?|pull_request_template\.md|\.github\/pull_request_template\.md)$/i,
      'Contribution process',
    ),
  },
  {
    id: 'doc.changelog',
    title: 'Change log and release notes',
    theme: 'build',
    fix: 'Keep a CHANGELOG with every release and what changed.',
    detect: docSignal(/(^|\/)(changelog|changes|history|releases?)(\.\w+)?$/i, 'Change log'),
  },
  {
    id: 'doc.requirements',
    title: 'Written requirements',
    theme: 'docs',
    fix: 'Write the requirements (functional, security and safety) in a versioned document, each with an ID.',
    detect: docSignal(
      /(^|\/)(docs?\/)?([\w-]*(requirements|srs|specification|spec)[\w-]*)\.(md|rst|txt|adoc|pdf)$/i,
      'Requirements',
    ),
  },
  {
    id: 'doc.architecture',
    title: 'Architecture and design record',
    theme: 'docs',
    fix: 'Describe the architecture (components, data flows, trust boundaries) and record design decisions (ADRs).',
    detect: docSignal(
      /(^|\/)((docs?\/)?[\w-]*(architecture|design)[\w-]*\.(md|rst|adoc)|(docs?\/)?(adr|decisions)\/[^/]+)$/i,
      'Architecture record',
    ),
  },
  {
    id: 'doc.threat_model',
    title: 'Threat model',
    theme: 'appsec',
    fix: 'Write a threat model: assets, entry points, threats and the control for each.',
    detect: docSignal(/(^|\/)[\w-]*(threat[-_ ]?model|stride|attack[-_]surface)[\w-]*\.(md|rst|adoc|pdf)$/i, 'Threat model'),
  },
  {
    id: 'doc.hazard_log',
    title: 'Hazard log or safety case',
    theme: 'safety',
    fix: 'Start a hazard log (hazard, cause, effect, severity, mitigation, status) and a safety case that argues from it.',
    detect: docSignal(
      /(^|\/)[\w-]*(hazard|safety[-_ ]?(case|plan|assessment|log)|fmea|fta|risk[-_ ]?(register|log|assessment))[\w-]*\.(md|rst|adoc|pdf|xlsx|csv)$/i,
      'Hazard or risk record',
    ),
  },
  {
    id: 'doc.verification',
    title: 'Verification record and traceability',
    theme: 'testing',
    fix: 'Trace each requirement to the tests that verify it, and keep the trace current in CI.',
    detect: docSignal(
      /(^|\/)[\w-]*(verification|traceab|test[-_ ]?plan|rtm)[\w-]*\.(md|rst|adoc|csv|xlsx|json)$/i,
      'Verification record',
    ),
  },
  {
    id: 'doc.operations',
    title: 'Operating and deployment instructions',
    theme: 'ops',
    fix: 'Write a runbook: how to deploy, configure, monitor, back up, restore and roll back.',
    detect: docSignal(
      /(^|\/)[\w-]*(runbook|operations|deploy(ment)?|install(ation)?|playbook)[\w-]*\.(md|rst|adoc)$/i,
      'Operations guide',
    ),
  },
  {
    id: 'doc.incident',
    title: 'Incident response procedure',
    theme: 'ops',
    fix: 'Document incident response: who is called, how incidents are triaged, contained and reviewed.',
    detect: docSignal(/(^|\/)[\w-]*(incident|on[-_]?call|postmortem|post-mortem)[\w-]*\.(md|rst|adoc)$/i, 'Incident procedure'),
  },
  {
    id: 'doc.privacy',
    title: 'Data protection notes',
    theme: 'governance',
    fix: 'Record what personal or sensitive data the software handles, where it is stored, and how long it is kept.',
    detect: docSignal(/(^|\/)[\w-]*(privacy|data[-_ ]?protection|gdpr|retention|dpia)[\w-]*\.(md|rst|adoc|pdf)$/i, 'Data protection record'),
  },
  {
    id: 'doc.ai',
    title: 'AI system documentation',
    theme: 'ai',
    fix: 'Write a model card or AI system description: purpose, model and provider, data used, known limits, human oversight.',
    detect: docSignal(/(^|\/)[\w-]*(model[-_ ]?card|ai[-_ ](policy|system|use|governance)|responsible[-_ ]ai)[\w-]*\.(md|rst|adoc|pdf)$/i, 'AI documentation'),
  },
  // Build, CI and release
  {
    id: 'ci.pipeline',
    title: 'Continuous integration pipeline',
    theme: 'build',
    fix: 'Add a CI pipeline that builds and checks every change before merge.',
    detect: (ix) => {
      const ci = filesMatching(ix, CI_FILES);
      return ci.length
        ? result(PASS, found(ci, 'CI pipeline'), `${ci.length} CI pipeline file(s)`)
        : result(FAIL, [], 'No CI pipeline');
    },
  },
  {
    id: 'ci.tests',
    title: 'Tests run in CI',
    theme: 'testing',
    fix: 'Run the test suite in CI on every change, and block merges when it fails.',
    detect: ciTests,
  },
  {
    id: 'tests.present',
    title: 'Automated tests',
    theme: 'testing',
    fix: 'Add automated tests, starting with the functions that carry the most risk.',
    detect: testDepth,
  },
  {
    id: 'lint.config',
    title: 'Coding standard enforced by a linter',
    theme: 'build',
    fix: 'Adopt a coding standard and enforce it with a linter and formatter in CI.',
    detect: docSignal(
      /(^|\/)(\.eslintrc(\.\w+)?|eslint\.config\.\w+|\.prettierrc(\.\w+)?|prettier\.config\.\w+|biome\.json|ruff\.toml|\.flake8|\.pylintrc|\.golangci\.ya?ml|\.rubocop\.yml|rustfmt\.toml|\.editorconfig|checkstyle\.xml|scripts\/format\.mjs)$/i,
      'Linter or formatter config',
    ),
  },
  {
    id: 'sast.tool',
    title: 'Static security analysis',
    theme: 'appsec',
    fix: 'Run a static analysis security tool (CodeQL, Semgrep or similar) in CI and triage its findings.',
    detect: codeSignal(
      /\b(codeql|semgrep|sonar(qube|cloud)?|bandit|gosec|brakeman|snyk code|eslint-plugin-security|spotbugs|njsscan)\b/i,
      'Static analysis',
      { only: /(\.ya?ml|package\.json|\.toml|\.cfg|\.properties|Jenkinsfile|\.eslintrc[\w.]*|eslint\.config\.\w+)$/i },
    ),
  },
  {
    id: 'deps.manifest',
    title: 'Declared dependencies',
    theme: 'supply',
    fix: 'Declare every third-party dependency in a manifest.',
    detect: depsManifest,
  },
  {
    id: 'deps.lockfile',
    title: 'Pinned dependency versions',
    theme: 'supply',
    fix: 'Commit lock files so every build installs exactly the same dependency versions.',
    detect: depsLocked,
  },
  {
    id: 'deps.updates',
    title: 'Automated dependency vulnerability updates',
    theme: 'supply',
    fix: 'Turn on Dependabot or Renovate (or an audit step in CI) so vulnerable dependencies are flagged and updated.',
    detect: (ix) => {
      const bots = filesMatching(ix, /(^|\/)(\.github\/dependabot\.ya?ml|renovate\.json5?|\.renovaterc(\.json)?)$/i);
      if (bots.length) return result(PASS, found(bots, 'update bot'), 'Dependency updates automated');
      const audit = grep(ix, /\b(npm audit|yarn audit|pnpm audit|pip-audit|safety check|cargo audit|govulncheck|osv-scanner|trivy|grype|dependency-check)\b/i, {
        only: ONLY_BUILD,
      });
      return audit.length
        ? result(PASS, audit.map((h) => ev(h.path, h.text, h.line)), 'Dependency audit runs')
        : result(FAIL, [], 'No dependency vulnerability monitoring');
    },
  },
  {
    id: 'sbom',
    title: 'Software bill of materials',
    theme: 'supply',
    fix: 'Generate an SBOM (CycloneDX or SPDX) for each release.',
    detect: (ix) => {
      const files = filesMatching(ix, /(^|\/)[\w.-]*(sbom|bom|cyclonedx|spdx)[\w.-]*\.(json|xml|spdx)$/i);
      if (files.length) return result(PASS, found(files, 'SBOM'), 'SBOM present');
      const gen = grep(ix, /\b(cyclonedx|syft|spdx-sbom-generator|sbom)\b/i, { only: ONLY_BUILD });
      return gen.length
        ? result(PASS, gen.map((h) => ev(h.path, h.text, h.line)), 'SBOM generated in the build')
        : result(FAIL, [], 'No SBOM');
    },
  },
  {
    id: 'release.integrity',
    title: 'Release integrity (signing or provenance)',
    theme: 'build',
    fix: 'Sign releases or publish build provenance (Sigstore/cosign, SLSA, checksums) so users can verify them.',
    detect: codeSignal(
      /\b(cosign|sigstore|slsa|provenance|gpg --(detach-)?sign|sha256sum|minisign|notation sign)\b/i,
      'Release signing or provenance',
      { only: ONLY_BUILD },
    ),
  },
  {
    id: 'container.nonroot',
    title: 'Container runs as non-root',
    theme: 'build',
    fix: 'Run the container as an unprivileged user (a USER line in the Dockerfile).',
    detect: containerNonRoot,
  },
  // Secrets and configuration
  {
    id: 'secrets.clean',
    title: 'No secrets in the code',
    theme: 'secrets',
    weight: 'critical',
    fix: 'Remove the secrets from the code and its history, rotate them, and load them from the environment or a secrets manager.',
    detect: secretsClean,
  },
  {
    id: 'secrets.gitignore',
    title: 'Environment files kept out of the repository',
    theme: 'secrets',
    fix: 'Add .env (and other local secret files) to .gitignore.',
    detect: secretsIgnored,
  },
  {
    id: 'config.documented',
    title: 'Configuration documented without values',
    theme: 'secrets',
    fix: 'Add a .env.example (names only) or a configuration reference listing every setting.',
    detect: docSignal(/(^|\/)(\.env\.(example|sample|template)|[\w-]*config(uration)?[-_ ]?(reference|index)?\.md)$/i, 'Configuration reference'),
  },
  // Application security
  {
    id: 'sec.headers',
    title: 'Security headers and content security policy',
    theme: 'appsec',
    fix: 'Send security headers: Content-Security-Policy, Strict-Transport-Security, X-Content-Type-Options and frame protection.',
    detect: codeSignal(
      /['"](Content-Security-Policy|Strict-Transport-Security|X-Frame-Options|X-Content-Type-Options)['"]\s*[:,)]|\bhelmet\s*\(|frame-ancestors|add_header\s+(Strict|Content|X-)|SECURE_HSTS_SECONDS|SECURE_CONTENT_TYPE_NOSNIFF|\.UseHsts\(/i,
      'Security headers',
      { exclude: /\.(md|json|txt)$/i },
    ),
  },
  {
    id: 'sec.validation',
    title: 'Input validation',
    theme: 'appsec',
    fix: 'Validate every input at the boundary against a schema (Zod, Joi, Pydantic or similar) and reject what does not fit.',
    detect: codeSignal(
      /\b(zod|joi|yup|ajv|express-validator|class-validator|pydantic|marshmallow|cerberus|validator\.js|jsonschema|valibot|superstruct)\b|\bvalidate\w*\s*\(/i,
      'Input validation',
      { only: ONLY_CODE, exclude: NOT_TESTS },
    ),
  },
  {
    id: 'sec.no_dangerous',
    title: 'No dangerous evaluation or shell calls',
    theme: 'appsec',
    weight: 'high',
    fix: 'Replace eval, shell string execution and unsafe deserialisation with safe APIs; escape or sanitise HTML sinks.',
    detect: dangerousCalls,
  },
  {
    id: 'sec.crypto',
    title: 'Sound cryptography',
    theme: 'appsec',
    fix: 'Use modern primitives (SHA-256 or better, bcrypt/argon2 for passwords) and a cryptographic random source for secrets.',
    detect: weakCrypto,
  },
  {
    id: 'sec.tls',
    title: 'Encrypted transport',
    theme: 'appsec',
    fix: 'Use HTTPS for every external endpoint and enforce it (HSTS).',
    detect: plainHttp,
  },
  {
    id: 'sec.rate_limit',
    title: 'Rate limiting and abuse protection',
    theme: 'appsec',
    fix: 'Rate-limit public endpoints and authentication attempts.',
    detect: codeSignal(/\b(rate[-_ ]?limit\w*|throttl\w*|express-rate-limit|slowapi|bottleneck|leaky bucket|token bucket)\b/i, 'Rate limiting', { only: ONLY_CODE, exclude: NOT_TESTS }),
  },
  // Identity and access
  {
    id: 'sec.authn',
    title: 'Authentication',
    theme: 'access',
    weight: 'high',
    fix: 'Require sign-in for anything that is not meant to be public, using a maintained identity provider or library.',
    detect: codeSignal(
      /((import|require|from)\b[^\n]*['"](passport[\w-]*|next-auth[\w/-]*|@auth0\/[\w-]+|@clerk\/[\w-]+|jsonwebtoken|jose|express-session|cookie-session|openid-client|oidc-client[\w-]*|keycloak[\w-]*|@supabase\/supabase-js|firebase\/auth|lucia|better-auth)['"]|\bimport flask_login\b|\bfrom flask_login\b|django\.contrib\.auth|@login_required|\blogin_required\(|passport\.authenticate\(|jwt\.(sign|verify|decode)\(|\bdevise\b|spring-security|AuthenticationManager|getServerSession\(|auth\(\)\.protect)/,
      'Authentication',
      { only: ONLY_CODE, exclude: NOT_TESTS },
    ),
  },
  {
    id: 'sec.mfa',
    title: 'Multi-factor authentication',
    theme: 'access',
    fix: "Offer or enforce multi-factor authentication (TOTP, WebAuthn or the identity provider's MFA).",
    detect: codeSignal(/((import|require|from)\b[^\n]*['"](otplib|speakeasy|@simplewebauthn\/[\w-]+|webauthn[\w-]*|pyotp|django_otp|two_factor)['"]|\bimport pyotp\b|\btotp\.(verify|generate)|navigator\.credentials\.(create|get)|\bmfa\w*\s*[(=:]\s*(true|required|enabled))/i, 'Multi-factor authentication', { only: ONLY_CODE, exclude: NOT_TESTS }),
  },
  {
    id: 'sec.authz',
    title: 'Authorisation checks',
    theme: 'access',
    weight: 'high',
    fix: 'Check permissions on every protected action (roles or policies), deny by default.',
    detect: codeSignal(/\b(casbin|cancan|pundit|permissions?_required|hasRole\(|has_permission\(|hasPermission\(|authorize\(|@PreAuthorize|requireRole\(|requirePermission\(|@roles_required|can\?\()/, 'Authorisation', { only: ONLY_CODE, exclude: NOT_TESTS }),
  },
  // Logging and errors
  {
    id: 'sec.logging',
    title: 'Structured logging',
    theme: 'logging',
    fix: 'Log security-relevant events (sign-ins, permission changes, errors) in a structured, central log.',
    detect: codeSignal(/((import|require|from)\b[^\n]*['"](winston|pino[\w-]*|bunyan|log4js|morgan|loglevel|consola|signale)['"]|^\s*import logging\b|logging\.getLogger\(|^\s*(import structlog|from loguru import)|LoggerFactory\.getLogger|zap\.New\w*\(|logrus\.|Serilog|NLog)/m, 'Logging library', { only: ONLY_CODE, exclude: NOT_TESTS }),
  },
  {
    id: 'sec.errors',
    title: 'Central error handling',
    theme: 'logging',
    fix: 'Handle errors in one place: log the detail, return a generic message, never a stack trace.',
    detect: codeSignal(/(app\.use\(\s*\(?\s*err\b|\berrorHandler\b|@ExceptionHandler|exception_handler|handle_exception|\bErrorBoundary\b|process\.on\(\s*['"](uncaughtException|unhandledRejection)|@sentry\/|Sentry\.init\()/, 'Error handling', { only: ONLY_CODE, exclude: NOT_TESTS }),
  },
]);

/** A signal by id. */
export const signalById = (id) => SIGNALS.find((s) => s.id === id) || null;

/** Whether the code uses AI or machine learning (decides ISO 42001 scope). */
export function usesAi(ix) {
  const hits = grep(
    ix,
    /((import|require|from)\b[^\n]*['"]?(openai|@anthropic-ai\/sdk|anthropic|@google\/generative-ai|google\.generativeai|langchain[\w/-]*|llamaindex|llama_index|transformers|torch|tensorflow|keras|sklearn|huggingface_hub|ollama|vllm|onnxruntime|xgboost|lightgbm|mistralai|cohere)\b|^\s*"(openai[\w-]*|@anthropic-ai\/sdk|@google\/generative-ai|langchain[\w/-]*|@huggingface\/[\w-]+|onnxruntime[\w-]*|@tensorflow\/[\w-]+|ollama)"\s*:|^\s*(openai|anthropic|langchain|transformers|torch|tensorflow|scikit-learn|huggingface-hub|ollama)\s*([=<>~!]=?|$))/im,
    { only: /(\.(m?[jt]sx?|py|go|rs|java|kt|cs|rb)|package\.json|requirements[\w-]*\.txt|pyproject\.toml)$/i, exclude: NOT_TESTS, max: 4 },
  );
  // Calls to hosted AI APIs count too (no SDK needed).
  const apis = hits.length
    ? []
    : grep(ix, /api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|api\.mistral\.ai|api-inference\.huggingface\.co|openrouter\.ai\/api|\/v1\/chat\/completions|\/v1\/realtime/i, {
        only: ONLY_CODE,
        exclude: NOT_TESTS,
        max: 4,
      });
  const all = [...hits, ...apis];
  return { used: all.length > 0, evidence: all.map((h) => ev(h.path, h.text, h.line)) };
}

/**
 * Run every signal over a snapshot.
 * @returns {{signals: Record<string, {state: string, summary: string, evidence: Array}>, inventory: object, ai: object}}
 */
export function gatherEvidence(snapshot) {
  const ix = indexSnapshot(snapshot);
  const signals = {};
  for (const s of SIGNALS) {
    let r;
    try {
      r = s.detect(ix);
    } catch (error) {
      r = result(PARTIAL, [], `Could not check (${error.message})`);
    }
    // Every piece of evidence gets a stable id the ratings can cite.
    r.evidence = r.evidence.map((e, i) => ({ id: `${s.id}#${i + 1}`, ...e }));
    signals[s.id] = r;
  }
  return { signals, inventory: inventory(ix), ai: usesAi(ix) };
}

/** What the snapshot contains: languages, file counts, biggest areas. */
export function inventory(ix) {
  const langs = {};
  for (const f of ix.code) {
    const ext = (f.path.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
    const lang = LANG[ext] || ext;
    langs[lang] = (langs[lang] || 0) + 1;
  }
  return {
    files: ix.files.length,
    codeFiles: ix.code.length,
    testFiles: ix.tests.length,
    bytes: ix.files.reduce((n, f) => n + (f.size || 0), 0),
    languages: Object.entries(langs)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, files]) => ({ name, files })),
  };
}

const LANG = {
  js: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript', jsx: 'JavaScript',
  ts: 'TypeScript', tsx: 'TypeScript', py: 'Python', rb: 'Ruby', go: 'Go',
  rs: 'Rust', java: 'Java', kt: 'Kotlin', scala: 'Scala', cs: 'C#',
  php: 'PHP', swift: 'Swift', c: 'C', cc: 'C++', cpp: 'C++', vue: 'Vue',
  svelte: 'Svelte',
};
