# RunLoyal booking platform

Spring Boot 3 / Java 17 transactional multi-tenant scheduling API.

## Run

Set `OKTA_ISSUER_URI` and `OKTA_AUDIENCE`, then start MySQL with `docker compose up mysql`; run `mvn spring-boot:run`, or package then `docker compose up --build`. Flyway runs automatically. Swagger: `http://localhost:8080/swagger-ui.html`.

## Authentication and demo strategy

Use an Okta/OIDC access token issued by the configured authorization server. The backend validates the JWT signature, issuer, expiration, and configured audience. Its `sub` must match an active `users.okta_subject` record; that record determines tenant and role. This project intentionally has no password login and no browser-provided tenant id. Flyway seeds two local demo memberships: `demo-happy-paws-admin` and `demo-paws-play-admin`; replace these placeholder subjects with trusted identity-management values outside local evaluation.

For Okta, create or use an Authorization Server such as `default`, expose an API audience such as `api://default`, and configure:

```text
OKTA_ISSUER_URI=https://{yourOktaDomain}/oauth2/default
OKTA_AUDIENCE=api://default
```

The frontend must request an access token for this audience and send it as `Authorization: Bearer <token>`. The backend does not accept an ID token as an API access token.

## API

`GET /api/me`, service and staff CRUD, availability management, service/staff assignment, available-staff lookup, available-slot calendar blocks, and booking calendar/create/read/cancel are available under `/api`. Management operations require `TENANT_ADMIN`; booking uses tenant membership.

`GET /api/me` returns the authenticated user, tenant ID, tenant display name, and tenant timezone. `GET /api/services/{serviceId}/available-slots?from=...&to=...` returns 30-minute candidate starts with their derived end time and eligible staff. The backend calculates these blocks using service duration, staff assignments, working windows, breaks, active states, and confirmed bookings.

## Tests

Run `mvn clean test` and `mvn clean package`. Use a MySQL/Testcontainers profile in CI for pessimistic-lock integration checks. See [architecture](ARCHITECTURE.md) and [technical notes](TECHNICAL_NOTES.md) for package boundaries, scheduling semantics, timezone, isolation, and concurrency.

## Local authentication

The demo memberships are database rows only; they do not bypass Okta token validation. A local token must have a matching `sub`, and clients must send `Authorization: Bearer <token>`.
