# RunLoyal booking platform

Multi-tenant pet-service administration built with Spring Boot 3 / Java 17+, React 18 / TypeScript, Vite, TanStack Query, MySQL 8.4, and Flyway. Authentication uses Okta OIDC / OAuth 2.0 Authorization Code + PKCE.

## Features

- Okta-hosted login, protected portal/API, and server-side tenant membership.
- Service catalog with category, duration, price, and active/inactive status.
- Staff management, service assignments, and recurring working hours/breaks/OFF windows.
- Week/day booking calendars, service/staff filtering, booking details, and cancellation.
- Booking form with eligible-staff lookup, server-side slot revalidation, and conflict feedback.
- `TENANT_ADMIN` mutations and tenant-scoped `STAFF` reads.

Known limitations and concurrency/testing caveats are documented in [backend/TECHNICAL_NOTES.md](backend/TECHNICAL_NOTES.md#known-limitations).

## Prerequisites

- Java 17+ and Maven 3.9+.
- Current Node.js LTS and npm.
- Docker with Compose for the default MySQL setup, or an existing local database.
- An Okta organization with an OIDC Single-Page Application and a custom authorization server.

## Okta setup

1. In **Applications → Applications**, create or select an **OIDC Single-Page Application**. Enable **Authorization Code + PKCE**, client authentication **None**. No browser client secret is needed; do not enable password, Implicit, or Client Credentials grants for this flow.
2. Register **Sign-in redirect URI** `http://localhost:3000/login/callback` and **Sign-out redirect URI** `http://localhost:3000/`. Assign the intended test users/groups to this app.
3. Under **Security → API → Trusted Origins**, add `http://localhost:3000` with **CORS** and **Redirect** for applicable SDK browser session calls. This does not replace the app's redirect URI registrations or configure backend CORS.
4. Under **Security → API → Authorization Servers → default → Settings**, copy the exact **Issuer** and **Audience**. The issuer has the shape `https://your-org.okta.com/oauth2/default`, with no trailing slash. `default` is a custom server; the org-root issuer cannot secure this API. `api://default` is a common audience, but use the actual configured value.
5. Under **Access Policies**, add/select a policy assigned to this SPA and a rule allowing the assigned test users/groups, **Authorization Code**, and **openid**, **profile**, **email** scopes. A policy without a matching rule is insufficient. Integrator Free Plan may provide the default server without an access policy. Check rule activity and priority if token preview reports **Policy evaluation failed**.

Use the same hostname/port throughout. For production, register exact HTTPS redirects, serve `/login/callback` through the SPA routing fallback, and proxy `/api` to the backend on the same origin. The Vite development proxy is not part of the production build. Official reference: [Okta authorization servers](https://developer.okta.com/docs/concepts/auth-servers/).

## Environment configuration

Copy [backend/.env.example](backend/.env.example) to [backend/.env](backend/.env), and [frontend/.env.example](frontend/.env.example) to [frontend/.env](frontend/.env). **For an existing installation, edit only the necessary settings; do not overwrite working local credentials or memberships.** The templates contain generic placeholders, not working Okta credentials.

| Setting | Value / purpose |
| --- | --- |
| `OKTA_ISSUER_URI` | Exact HTTPS custom authorization server issuer, no trailing slash |
| `OKTA_AUDIENCE` | Actual server Settings audience, e.g. `api://default`; **not the SPA Client ID** |
| `DB_URL` | Native MySQL example: `jdbc:mysql://localhost:3306/runloyal` |
| `DB_USER`, `DB_PASSWORD` | Dedicated local database account; Compose provides its own demo defaults |
| `VITE_OKTA_ISSUER` | Exactly the same issuer as `OKTA_ISSUER_URI` |
| `VITE_OKTA_CLIENT_ID` | Public SPA Client ID from Okta |
| `VITE_OKTA_SCOPES` | `openid profile email`, space-separated; add only policy-required custom scopes |
| `VITE_OKTA_REDIRECT_URI` | `http://localhost:3000/login/callback`; blank defaults to the current origin and that path |
| `VITE_OKTA_LOGOUT_URI` | `http://localhost:3000/`; blank defaults to the current origin and `/` |
| `VITE_API_BASE_URL` | `http://localhost:8080`, used by Vite to proxy `/api` in development |

There is no frontend audience setting. The custom server determines the access-token audience. Never put passwords, tokens, or client secrets in `VITE_` variables: they are public browser configuration.

Native Maven loads [backend/.env](backend/.env) through [application.yml](backend/src/main/resources/application.yml) **when launched from the backend directory**. Use plain `NAME=value` properties without wrapping quotes or shell `export`; escape literal backslashes using Java properties syntax. Exported environment variables take precedence. Restart the backend and Vite after changing settings.

## Run locally

### Option A: MySQL and API with Docker Compose

1. Complete the Okta/environment setup above.
2. In the backend directory, run `mvn clean package`, then `docker compose up --build`. **Package first:** [backend/Dockerfile](backend/Dockerfile) copies the prebuilt JAR; it does not compile Java. Flyway creates the schema and demo data automatically on a new database.
3. In a separate terminal, in the frontend directory, run `npm ci`, then `npm run dev`.
4. Provision the demo memberships below, then open http://localhost:3000.

[backend/docker-compose.yml](backend/docker-compose.yml) publishes MySQL on 3306 and the API on 8080. Avoid port conflicts with native services. Its database passwords are development defaults only; no explicit persistent volume is configured, so back up data before replacing containers. Do not share production credentials or database volumes in a submission.

### Option B: Existing local database and native Maven

1. Provision an empty `runloyal` database and dedicated application account, or use the existing local database without resetting it.
2. Set `DB_URL`, `DB_USER`, and `DB_PASSWORD` locally. In the backend directory, run `mvn spring-boot:run`; Flyway applies pending migrations and Hibernate validates the schema.
3. In the frontend directory, run `npm ci`, then `npm run dev`.

**MariaDB compatibility:** use `DB_URL=jdbc:mariadb://localhost:3306/runloyal` and `DB_MIGRATION_LOCATION=classpath:db/mariadb`. The URL selects MariaDB Connector/J; a MySQL URL against MariaDB can fail with `auth_gssapi_client`. MySQL 8.4 remains the assessment target; MariaDB is a local compatibility option. See [database notes](backend/TECHNICAL_NOTES.md#database-compatibility) before changing migration locations on an existing database.

**Windows HTTPS trust:** if Java reports `PKIX path building failed` while browser HTTPS works, use an approved truststore. On Windows, the tested process-scoped launch is `mvn spring-boot:run '-Dspring-boot.run.jvmArguments=-Djavax.net.ssl.trustStoreType=Windows-ROOT -Djavax.net.ssl.trustStore=NONE'` from the backend directory. This preserves certificate/hostname validation; do not use trust-all code.

| Component | URL |
| --- | --- |
| Portal | http://localhost:3000 |
| API | http://localhost:8080/api |
| Swagger UI | http://localhost:8080/swagger-ui.html |
| OpenAPI | http://localhost:8080/v3/api-docs |
| Health | http://localhost:8080/actuator/health |

## Demo data and login memberships

The [MySQL seed](backend/src/main/resources/db/migration/V2__demo_data.sql) and [MariaDB seed](backend/src/main/resources/db/mariadb/V2__demo_data.sql) contain:

| Tenant | Timezone | Services (minutes / price) | Staff | Admin placeholder subject |
| --- | --- | --- | --- | --- |
| Happy Paws | Asia/Kolkata | Full Grooming (90 / 75.00), Bath & Dry (60 / 45.00) | John Smith, Emily Davis, Sam Brown | `demo-happy-paws-admin` |
| Paws & Play | America/New_York | Dog Training (60 / 60.00), Nail Trim (30 / 25.00) | Alex Taylor, Jordan Lee | `demo-paws-play-admin` |

All seeded users/services/staff are ACTIVE; both login memberships are TENANT_ADMIN. John and Emily are assigned both Happy Paws services; Sam has no assignment. Alex is assigned Dog Training; Jordan is assigned Nail Trim. Only John and Alex have seeded working windows, Monday/Tuesday 09:00–17:00 in their tenant timezones. There are no seeded bookings, breaks, OFF windows, passwords, or STAFF login memberships. Seed prices have no currency field.

### Map Okta users to tenants

1. Create two distinct test users in Okta using addresses you control and assign them to the SPA. Set passwords directly in Okta, not in the app or database.
2. In **Security → API → default → Token Preview**, select the app, user, **Authorization Code**, and scopes `openid profile email`. Inspect the **Access Token**, not the ID Token. Its `aud` must match `OKTA_AUDIENCE`.
3. Copy only the exact access-token **`sub`**. It may be a username/email and can differ from the ID-token subject or `uid`. A preview helps establish the intended mapping; the backend validates the actual token during sign-in.
4. In a trusted local database session, replace each corresponding placeholder in `users.okta_subject`, preserving its existing user ID, tenant ID, `TENANT_ADMIN` role, and `ACTIVE` status. Check the tenant/row first; do not overwrite an already-mapped user blindly, edit migrations, or store a whole token. The Happy Paws user ID ends in `111112`; the Paws & Play user ID ends in `222223` (full IDs are in the seed).
5. For STAFF-role testing, create a third assigned Okta user and a separate ACTIVE `users` membership with role `STAFF` in one demo tenant. A scheduling `staff` row alone is not a login account; seeded staff have `user_id = NULL`.
6. Sign in separately as each user and confirm `/api/me` returns the expected tenant and role. All API mutations, including booking create/cancel, require `TENANT_ADMIN`.

No tenant ID or role supplied by the browser is trusted. Secrets, actual user subjects, and complete tokens must not be committed to source or pasted into public JWT decoders.

## API and troubleshooting

OpenAPI/Swagger documents the request/response DTOs for `/api/me`, services, staff, assignments, recurring availability, eligible staff/slots, and booking list/create/details/cancellation. The API sends structured errors rather than persistence entities.

| Symptom | Check |
| --- | --- |
| Authentication configuration required | Replace placeholders, use the custom HTTPS issuer, and restart Vite |
| Okta policy evaluation failed | Correct server, SPA assignment, matching access policy **and rule**, Authorization Code, allowed users/scopes |
| Redirect rejected | Exact Sign-in/Sign-out URI, hostname, port, and trailing logout slash; Trusted Origins are separate |
| API 401 | Access token rather than ID token; issuer, API audience, signature, expiration, subject, and scopes |
| API 403 / No active tenant membership | Exact access-token `sub` matches an ACTIVE `users` row; also check tenant ownership and database role |
| Database 1045 / Access denied | Database account/password/host permissions; unrelated to Okta. Do not change accounts or grants blindly |
| Logout failure | Exact Sign-out redirect URI, network, SDK hints, and browser cookie restrictions; local UI stays locked |

The SDK requests remote logout/revocation, but this stateless API validates JWTs locally. Already-issued tokens may remain usable until expiry; a locked screen is not proof of global or cross-tab logout. See [authentication notes](backend/TECHNICAL_NOTES.md#authentication-and-logout).

## Tests and verification

| Directory | Command | Purpose |
| --- | --- | --- |
| Backend | `mvn test` | Unit tests and locally signed JWT/configuration regressions |
| Backend | `mvn clean package` | Compile, test, and package the API |
| Frontend | `npm test` | Vitest / React Testing Library tests |
| Frontend | `npm run build` | TypeScript check and Vite production bundle |
| Frontend | `npm run lint` | ESLint |

Calendar regressions can be run with `npm test -- src/__tests__/calendar`, setting process `TZ` separately to `UTC`, `Asia/Kolkata`, `America/Los_Angeles`, and `America/New_York`.

**Last recorded validation (September 14, 2026, before this documentation cleanup):** 191 frontend tests and 70 Maven tests passed; frontend build/lint passed. Native API startup, health 200, unauthenticated `/api/me` 401, and the Okta-hosted login redirect were observed. The developer subsequently reported the configured application working. This cleanup does not rerun or independently certify all authenticated flows, tenant-isolation cases, or concurrent bookings. Vite's bundle-size and local MariaDB/Flyway compatibility warnings remain.

For an assessment walkthrough, test two tenant admins and STAFF, verify `/api/me` and cross-tenant read/write denial, create/cancel a valid booking, check break/duration/inactive-staff cases, and test sign-out/re-login. Real MySQL simultaneous overlapping requests still require dedicated concurrency proof; see [known limitations](backend/TECHNICAL_NOTES.md#known-limitations).

## Required deliverables

Section 12 of the assignment asks for the following. Shared setup is maintained here; directory-specific startup guides are in [backend/README.md](backend/README.md) and [frontend/README.md](frontend/README.md).

| Deliverable | Location |
| --- | --- |
| Complete source | [backend/src](backend/src), [frontend/src](frontend/src), and their build/configuration files |
| Setup/run instructions | [README.md](README.md), [backend/README.md](backend/README.md), [frontend/README.md](frontend/README.md) |
| Database migrations | [backend/src/main/resources/db/migration](backend/src/main/resources/db/migration); optional [MariaDB variants](backend/src/main/resources/db/mariadb) |
| Docker / Docker Compose | [backend/Dockerfile](backend/Dockerfile), [backend/docker-compose.yml](backend/docker-compose.yml) |
| Automated tests | [backend/src/test](backend/src/test), [frontend/src/__tests__](frontend/src/__tests__) |
| API documentation | http://localhost:8080/swagger-ui.html and http://localhost:8080/v3/api-docs when running |
| Architecture diagram | [backend/ARCHITECTURE.md](backend/ARCHITECTURE.md) |
| AI usage | [AI_USAGE.md](AI_USAGE.md) |
| Two-tenant demo data | [V2 seed](backend/src/main/resources/db/migration/V2__demo_data.sql) |
| Isolation/concurrency/timezone notes | [backend/TECHNICAL_NOTES.md](backend/TECHNICAL_NOTES.md) |

Submit source, dependency manifests/lockfile, configuration templates, tests, migrations, Docker files, and the Markdown documentation listed above. Exclude local environment files, passwords/tokens, database exports, dependency directories, virtual environments, build outputs, and local review/tool artifacts from any submission archive. Keep generic configuration templates. Do not delete working local dependencies or credentials just to prepare an archive.
