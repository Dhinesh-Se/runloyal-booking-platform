# RunLoyal booking platform

Spring Boot 3 / Java 17 transactional multi-tenant scheduling API.

## Run

Copy `.env.example` to `.env`, set the Auth0 values, and start MySQL with `docker compose up mysql`; run `mvn spring-boot:run`, or package then `docker compose up --build`. Flyway runs automatically. Swagger: `http://localhost:8080/swagger-ui.html`.

## Authentication and demo strategy

Use an Auth0/OIDC access token issued by the configured authorization server. The backend validates the JWT signature, issuer, expiration, and configured audience. Its `sub` must match an active `users.okta_subject` record; that legacy column name is retained for API/database compatibility and stores the Auth0 subject. This project intentionally has no password login and no browser-provided tenant id. Flyway seeds two local demo memberships; map your Auth0 `sub` to one active user row for local access.

For Auth0, create an API with identifier `https://runloyal-booking-api`, configure a SPA application, and allow `http://localhost:3000/` as callback, logout, web-origin, and CORS origin. Configure the backend with:

```text
AUTH0_ISSUER_URI=https://dev-jeektm432okco8vi.us.auth0.com/
AUTH0_AUDIENCE=https://runloyal-booking-api
```

The frontend must request an access token for this audience and send it as `Authorization: Bearer <token>`. The backend does not accept an ID token as an API access token.

## API

`GET /api/me`, service and staff CRUD, availability management, service/staff assignment, available-staff lookup, available-slot calendar blocks, and booking calendar/create/read/cancel are available under `/api`. Management operations require `TENANT_ADMIN`; booking uses tenant membership.

`GET /api/me` returns the authenticated user, tenant ID, tenant display name, and tenant timezone. `GET /api/services/{serviceId}/available-slots?from=...&to=...` returns 30-minute candidate starts with their derived end time and eligible staff. The backend calculates these blocks using service duration, staff assignments, working windows, breaks, active states, and confirmed bookings.

## Tests

Run `mvn clean test` and `mvn clean package`. Use a MySQL/Testcontainers profile in CI for pessimistic-lock integration checks. See [architecture](ARCHITECTURE.md) and [technical notes](TECHNICAL_NOTES.md) for package boundaries, scheduling semantics, timezone, isolation, and concurrency.

## Local authentication

The demo memberships are database rows only; they do not bypass Auth0 token validation. A local token must have a matching `sub`, and clients must send `Authorization: Bearer <token>`. The frontend configuration is in `frontend/.env.example`.

## Deliverables

- Database migrations: `src/main/resources/db/migration/`
- Docker execution: `Dockerfile` and `docker-compose.yml`
- Automated tests: `src/test/java/`
- API documentation: Swagger at `/swagger-ui.html` and `/v3/api-docs`
- Architecture diagram: `ARCHITECTURE.md`
- AI usage record: `AI_USAGE.md`
- Two-tenant demo data: `V2__demo_data.sql`
- Security, concurrency, and timezone notes: `TECHNICAL_NOTES.md`
