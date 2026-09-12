# RunLoyal booking platform

RunLoyal is a multi-tenant pet-service admin portal with a React/TypeScript frontend and Spring Boot/Java 17 API. It uses Okta OIDC access tokens, MySQL, Flyway migrations, and server-side tenant scoping.

## Start locally

1. Copy `frontend/.env.example` to `frontend/.env` and set the public Okta SPA values. Configure `http://localhost:3000/login/callback` as an Okta sign-in redirect URI and `http://localhost:3000` as a sign-out redirect URI.
2. Copy `backend/.env.example` to `backend/.env` and set `OKTA_ISSUER_URI` and `OKTA_AUDIENCE` to the same authorization server/audience.
3. Start the API and database with `cd backend && docker compose up --build`, or start MySQL with `docker compose up mysql` then run `mvn spring-boot:run`.
4. In another terminal, run `cd frontend && npm install && npm run dev`.

Swagger is available at `http://localhost:8080/swagger-ui.html`; the API health check is `http://localhost:8080/actuator/health`.

## Verification

* Backend: `cd backend && mvn clean test && mvn clean package`
* Frontend: `cd frontend && npm install && npm test && npm run build`

Flyway seeds Happy Paws and Paws & Play. Demo database memberships deliberately do not bypass Okta: the token `sub` must match a seeded (or provisioned) active user. See [backend documentation](backend/README.md), [architecture](backend/ARCHITECTURE.md), [technical notes](backend/TECHNICAL_NOTES.md), and [AI usage](backend/AI_USAGE.md).
