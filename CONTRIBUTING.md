# Contributing

1. Branch from `main` (`feature/…`, `fix/…`, `audit/…`).
2. Keep changes small. Run the gates in [TESTING.md](TESTING.md).
3. New behaviour needs a requirement ID ([docs/REQUIREMENTS.md](docs/REQUIREMENTS.md)),
   a test, and a traceability row ([docs/VERIFICATION.md](docs/VERIFICATION.md)).
4. Update [CHANGELOG.md](CHANGELOG.md).
5. Merge to `main` only after a clean-clone verification (test, build, smoke).
   Then deploy and confirm the build stamp.

## Rules that are not negotiable

- Never present simulated content as feed data. Tag it SIMULATED.
- No dossiers on natural persons. Live mode gets no kinetic actions.
- Never commit credentials. Only names go in `.env.example`.
- Every feed string is untrusted. Render it through `esc()` or `textContent`.
- New data sources need a licence entry and commercial-use flag in
  [DATA_SOURCES.md](DATA_SOURCES.md), plus an in-app credit.
