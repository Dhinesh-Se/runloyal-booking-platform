# AI usage and decisions

## Tools and scope

**GitHub Copilot** in VS Code assisted with code exploration, implementation corrections, tests, execution diagnostics, and documentation. Earlier project work was recorded as AI-assisted, but the available history does not establish other tools or their exact contributions. This record covers the verified work and does not claim independent human certification.

The complete eight-page [assignment](RunLoyal_Machine_Test_Multi_Tenant_Service_Staff_Booking.pdf) was read using local PDF extraction. That tooling is not an application runtime dependency.

## Major tasks delegated to AI

- Review authentication, server-side tenant isolation, service/staff management, availability, booking transactions, and calendar flows against the requirements.
- Replace the earlier Auth0 integration with the named Okta provider using the official React/Auth JS SDKs, Authorization Code + PKCE, and custom-server configuration. Remove the unused Auth0 dependency.
- Strengthen backend JWT validation and add locally signed token regressions for issuer/audience/signature/expiry, missing subject/scopes, and ID-token substitution.
- Correct sign-out races: lock protected UI, cancel API work, suppress late tokens, clear query/mutation caches, preserve logout hints for retry, and keep the gate closed after SDK/storage failures.
- Fix calendar date mismatches through consistent UTC arithmetic/formatting, exclusive week bounds, and interval-based booking placement. Add timezone/DST regressions using `@date-fns/utc`.
- Diagnose local MariaDB startup, add the patched driver and compatible binary-UUID seed migrations, and test driver selection/migration equivalence. A historical failed migration was repaired only with explicit approval after checking history and empty tables; original MySQL checksums and database accounts/grants were preserved.
- Validate Java HTTPS using process-scoped Windows trusted roots without disabling certificate or hostname verification.
- Consolidate setup, demo provisioning, validation evidence, architecture, and technical notes into the four submission documents required by the PDF's documentation deliverables.

## Notable prompts and decisions

Representative user requests were to review the full PDF, fix a booking appearing on the wrong date and broken sign-out, switch both apps to Okta, explain token-to-membership mapping, and remove redundant documents for submission.

1. **Provider choice:** Auth0 ownership/protocol compatibility did not meet the named Okta integration requirement. Use a public SPA and a custom authorization server, not an org-root issuer or browser client secret.
2. **Identity boundary:** API requests carry access tokens, never ID tokens. Map the exact verified access-token `sub` to ACTIVE database membership; do not substitute an ID-token subject, `uid`, or a separate email claim. Tenant and role remain server-controlled.
3. **Time:** bookings and portal labels use UTC; recurring schedules use the tenant's IANA timezone. The remaining calendar overlay/eligibility mismatch is documented, not relabelled as solved.
4. **Logout:** local locking, remote SSO logout, and token revocation are separate outcomes. A stateless API may still accept an already-issued JWT until expiry.
5. **Verification:** distinguish source review, mocked/unit tests, runtime observations, and developer-reported success. Do not infer database concurrency safety from a lock or full assessment compliance from working login.

## Validation and developer responsibility

Before this documentation cleanup, the recorded results were **191 frontend tests**, **70 Maven tests**, and successful frontend build/lint. Native API startup, health 200, unauthenticated API 401, and an Okta login redirect were observed. The developer subsequently reported the configured application working. The documentation cleanup itself runs no new application tests and makes no application, identity, or database changes.

The developer remains responsible for reviewing AI-generated changes, configuring real accounts securely, and completing acceptance tests. Full MySQL concurrency, exhaustive cross-tenant API tests, and remaining UI gaps are listed in [backend/TECHNICAL_NOTES.md](backend/TECHNICAL_NOTES.md#known-limitations). Commands and deliverables are in [README.md](README.md).

Keep real user subjects and credentials in trusted local configuration/administration only. Never commit passwords, client secrets, complete tokens, customer data, or private environment files. Do not send secrets to AI tools or public token decoders.