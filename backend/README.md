# RunLoyal booking platform
Spring Boot 3 / Java 17 transactional multi-tenant scheduling API.

## Run
Set `OKTA_ISSUER_URI` and start MySQL with `docker compose up mysql`; run `mvn spring-boot:run`, or package then `docker compose up --build`. Flyway runs automatically. Swagger: `http://localhost:8080/swagger-ui.html`.

## Authentication and demo strategy
Use an Okta/OIDC access token. Its `sub` must match an active `users.okta_subject` record; that record determines tenant and role. This project intentionally has no password login and no browser-provided tenant id. Seed test identities should use placeholders such as `demo-happy-paws-admin`, never real credentials.

## API
`GET /api/me`, service and staff CRUD, availability management, service/staff assignment, available-staff lookup, booking calendar/create/read/cancel are available under `/api`. Management operations require `TENANT_ADMIN`; booking uses tenant membership.

## Tests
Run `mvn test`. Use a MySQL/Testcontainers profile in CI for pessimistic-lock integration checks. See [technical notes](TECHNICAL_NOTES.md) for scheduling semantics, timezone, isolation, and concurrency.

## Limitations
Demo user rows are not inserted automatically because production deployments provision them from trusted identity administration. A frontend must obtain Okta tokens and send `Authorization: Bearer <token>`.
