# AI usage and decisions

## Tools and scope

**GitHub Copilot** in VS Code assisted with code exploration, implementation corrections, tests, execution diagnostics, and documentation. Earlier project work was recorded as AI-assisted, but the available history does not establish other tools or their exact contributions. This record covers the work represented in this repository and does not claim independent human certification.

The assignment requirements were reviewed from the available project materials and assessment brief. Assessment-reference materials are not application runtime dependencies and are not included in this repository.

## Major tasks delegated to AI

- Review authentication, server-side tenant isolation, service/staff management, availability, booking transactions, and calendar flows against the requirements.
- Replace the earlier Auth0 integration with the named Okta provider using the official React/Auth JS SDKs, Authorization Code + PKCE, and custom-server configuration. Remove the unused Auth0 dependency.
- Strengthen backend JWT validation and add locally signed token regressions for issuer/audience/signature/expiry, missing subject/scopes, and ID-token substitution.
- Correct sign-out races: lock protected UI, cancel API work, suppress late tokens, clear query/mutation caches, preserve logout hints for retry, and keep the gate closed after SDK/storage failures.
- Fix calendar date mismatches through consistent UTC arithmetic/formatting, exclusive week bounds, and interval-based booking placement. Add timezone/DST regressions using `@date-fns/utc`.
- Diagnose local MariaDB startup, add the patched driver and compatible binary-UUID seed migrations, and test driver selection/migration equivalence. A historical failed migration was repaired only with explicit approval after checking history and empty tables; original MySQL checksums and database accounts/grants were preserved.
- Validate Java HTTPS using process-scoped Windows trusted roots without disabling certificate or hostname verification.
- Add tenant-scoped dated staff-unavailability exceptions, including MySQL/MariaDB migrations, backend availability enforcement, CRUD API contracts, and regression coverage.
- Consolidate setup, demo provisioning, validation evidence, architecture, and technical notes into the required submission documents.

## Notable prompts and decisions

Representative user requests were to review the assessment requirements, fix a booking appearing on the wrong date and broken sign-out, switch both apps to Okta, explain token-to-membership mapping, and remove redundant documents for submission.

1. **Provider choice:** Auth0 ownership/protocol compatibility did not meet the named Okta integration requirement. Use a public SPA and a custom authorization server, not an org-root issuer or browser client secret.
2. **Identity boundary:** API requests carry access tokens, never ID tokens. Map the exact verified access-token `sub` to ACTIVE database membership; do not substitute an ID-token subject, `uid`, or a separate email claim. Tenant and role remain server-controlled.
3. **Time:** bookings and portal labels use UTC; recurring schedules use the tenant's IANA timezone. One-off unavailability is stored as UTC instants and participates in the same half-open interval checks as bookings.
4. **Logout:** local locking, remote SSO logout, and token revocation are separate outcomes. A stateless API may still accept an already-issued JWT until expiry.
5. **Verification:** distinguish source review, mocked/unit tests, runtime observations, and developer-reported success. Do not infer database concurrency safety from a lock or full assessment compliance from working login.

## Validation and developer responsibility

Historical project notes record **191 frontend tests**, **70 Maven tests**, successful frontend build/lint, native API startup, health 200, an unauthenticated API 401, and an Okta login redirect. Those are historical observations, not a substitute for rerunning the current revision. The dated-unavailability enhancement added application code, migrations, API contracts, and regression tests; its current validation status is reported in the pull request and final change summary.

The developer remains responsible for reviewing AI-generated changes, configuring real accounts securely, and completing acceptance tests. Full MySQL concurrency proof remains an open verification item; current known limitations are listed in [backend/TECHNICAL_NOTES.md](backend/TECHNICAL_NOTES.md#known-limitations). Commands and deliverables are in [README.md](README.md).

Keep real user subjects and credentials in trusted local configuration/administration only. Never commit passwords, client secrets, complete tokens, customer data, or private environment files. Do not send secrets to AI tools or public token decoders.
