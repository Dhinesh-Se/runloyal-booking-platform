# RunLoyal backend

Spring Boot 3.4 / Java 17+ REST API with Spring Security, JPA, Flyway, and MySQL. MariaDB is supported as a local compatibility option. Authentication uses Okta access tokens; tenant membership and roles are resolved on the server.

## Prerequisites

- Java 17+ and Maven 3.9+.
- A running MySQL database, or a local MariaDB database with the configuration below.
- An Okta custom authorization server and assigned SPA users. Complete the [shared Okta setup](../README.md#okta-setup) first.

## Configure

Run all commands below from the `backend` directory. For a new installation only, create the local configuration in PowerShell:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Edit the local values using [.env.example](.env.example) as the template. Preserve existing credentials and memberships.

| Variable | Required value |
| --- | --- |
| `OKTA_ISSUER_URI` | Exact custom server issuer, such as `https://your-org.okta.com/oauth2/default`, without a trailing slash |
| `OKTA_AUDIENCE` | Audience from that server's Settings, commonly `api://default`; not the SPA Client ID |
| `DB_URL` | `jdbc:mysql://localhost:3306/runloyal` for MySQL |
| `DB_USER`, `DB_PASSWORD` | Credentials for the existing application database account |
| `DB_MIGRATION_LOCATION` | Defaults to `classpath:db/migration`; use `classpath:db/mariadb` for MariaDB |

[application.yml](src/main/resources/application.yml) loads the local environment file as Java properties when Maven runs from this directory. Use plain `NAME=value` entries without wrapping quotes or `export`; escape literal backslashes using Java properties syntax. Exported environment variables take precedence. Restart the backend after configuration changes. Never commit local credentials or tokens.

For MariaDB, set both values:

```properties
DB_URL=jdbc:mariadb://localhost:3306/runloyal
DB_MIGRATION_LOCATION=classpath:db/mariadb
```

Read the [database compatibility notes](TECHNICAL_NOTES.md#database-compatibility) before changing migration locations on an existing database. Do not reset the database or edit applied migrations to resolve startup errors.

## Run locally

With the database running and configuration complete:

```sh
mvn spring-boot:run
```

### Windows certificate trust

If startup fails while creating `jwtDecoder` with `PKIX path building failed` or `unable to find valid certification path`, Java cannot validate the certificate chain presented by the Okta HTTPS endpoint. On Windows, where the approved certificate authority is already trusted by Windows, use this tested PowerShell command instead:

```powershell
mvn spring-boot:run '-Dspring-boot.run.jvmArguments=-Djavax.net.ssl.trustStoreType=Windows-ROOT -Djavax.net.ssl.trustStore=NONE'
```

Alternatively, use VS Code **Tasks: Run Task** and select **Run backend (Windows trusted roots)**. These JVM settings apply to this launch only; plain `mvn spring-boot:run` does not retain them. Certificate and hostname validation remain enabled. If the Windows store also lacks the required certificate, ask your administrator for an approved truststore; do not disable TLS verification.

Flyway applies pending migrations and Hibernate validates the schema during startup. The API listens on port 8080; stop any existing backend before starting another instance. Local MariaDB `WSREP_ON` and Flyway version-compatibility warnings are separate from the Okta certificate error and did not prevent the verified startup.

| Endpoint | URL |
| --- | --- |
| Health | http://localhost:8080/actuator/health |
| Swagger UI | http://localhost:8080/swagger-ui.html |
| OpenAPI | http://localhost:8080/v3/api-docs |
| API | http://localhost:8080/api |

Check health in a separate PowerShell terminal:

```powershell
Invoke-RestMethod -Uri http://localhost:8080/actuator/health
```

Expect `status: UP`. An unauthenticated request to `/api/me` should return 401. Successful health checks do not verify authenticated user flows.

## Docker alternative

Follow the [Docker Compose instructions](../README.md#option-a-mysql-and-api-with-docker-compose). Run `mvn clean package` before `docker compose up --build`: the [Dockerfile](Dockerfile) copies a prebuilt JAR. Avoid conflicts with native database/API ports. Windows trust-store settings do not apply inside Linux containers.

## Login and tenant membership

Follow [Map Okta users to tenants](../README.md#map-okta-users-to-tenants). An assigned Okta user also needs an ACTIVE database membership matching the exact access-token `sub`. Seed placeholder subjects are not working logins, and a scheduling staff record is not a login membership. API mutations require `TENANT_ADMIN`.

For a 401, check the access token, issuer, audience, expiry, subject, and scopes. For a 403, check active membership, tenant ownership, and role. Do not substitute ID tokens or bypass token validation.

## Build and tests

```sh
mvn test
mvn clean package
```

See [ARCHITECTURE.md](ARCHITECTURE.md), [TECHNICAL_NOTES.md](TECHNICAL_NOTES.md), and the [shared verification notes](../README.md#tests-and-verification) for design, test scope, and known limitations. Start the portal using the [frontend guide](../frontend/README.md).