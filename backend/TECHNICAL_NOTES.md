# Technical notes

## Tenant isolation and roles

[TenantContext](src/main/java/com/runloyal/booking/security/TenantContext.java) resolves the verified Okta **access-token `sub`** through `users.okta_subject` to an ACTIVE membership. That row supplies the tenant ID and role. A browser-supplied tenant/role or an Okta group claim cannot select membership; resource lookups use `(id, tenant_id)` and deny cross-tenant IDs without returning their data.

`TENANT_ADMIN` permits mutations, including booking create/cancel. `STAFF` permits tenant-scoped reads. No local password authentication or automatic membership provisioning exists. Seed memberships require real Okta subject mapping; scheduling staff records are not login accounts. See [demo provisioning](../README.md#map-okta-users-to-tenants).

## Availability and booking integrity

[AvailabilityEngine](src/main/java/com/runloyal/booking/service/AvailabilityEngine.java) requires an ACTIVE service and staff member, a service assignment, the entire duration within working hours, no break/OFF overlap, no dated unavailable-period overlap, and no conflicting confirmed booking. Cancelled bookings do not block availability. Intervals are half-open: `[start, end)`; touching endpoints do not conflict. Cross-day slots are rejected by the current engine.

`GET /api/services/{serviceId}/available-staff?startAt=...` checks a candidate start. `GET /api/services/{serviceId}/available-slots?from=...&to=...` generates 30-minute candidate starts in tenant time, returning service-duration-derived ends and eligible staff. Booking creation derives `endAt` from the service duration and revalidates eligibility immediately before persistence; client-side validation alone is not authoritative.

## Concurrency strategy and risk

[BookingFeatureService](src/main/java/com/runloyal/booking/service/BookingFeatureService.java) uses a transaction and a tenant-scoped pessimistic staff-row lock before checking booking overlaps and saving. The intended strategy serializes bookings per staff member.

**At-most-one concurrent success is not yet proven.** Membership reads happen before lock acquisition. With MySQL's usual REPEATABLE READ default, a waiting transaction may retain an older snapshot for later non-locking conflict queries. Validate and, if needed, correct the isolation/current-read strategy under real MySQL. A two-transaction test must assert exactly one successful overlapping booking and one persisted row. The presence of `PESSIMISTIC_WRITE` alone is not sufficient evidence. Concurrent availability edits also need dedicated tests.

## Timezone strategy

Tenants store IANA zones. Bookings persist UTC `Instant` values, and APIs accept/return ISO-8601 instants. Booking inputs, calendar headings/times, prefills, and detail labels are **UTC**, using UTC arithmetic and `@date-fns/utc`. Weeks are `[Monday 00:00 UTC, next Monday 00:00 UTC)`. Booking placement uses instant interval overlap, including offset timestamps and midnight crossings, rather than timestamp substrings.

Recurring WORKING/BREAK/OFF schedules are **tenant-local wall times**, evaluated by the backend in the tenant's timezone. Storing bookings in UTC does not make recurring wall times UTC. The calendar's raw recurring-schedule overlay still needs tenant-zone conversion and integration with backend eligible slots; the booking form and API perform the actual eligibility validation.

## Authentication and logout

The public SPA uses `@okta/okta-react` + `@okta/okta-auth-js` with Authorization Code + PKCE. Frontend and backend use the same HTTPS custom server issuer (`/oauth2/{id}`, no trailing slash). The server named `default` is custom; the org-root server's access tokens are not intended for this API. Setup, assignments, policy/rule configuration, and exact redirect URIs are in [README.md](../README.md#okta-setup).

[SecurityConfig](src/main/java/com/runloyal/booking/config/SecurityConfig.java) validates signature, exact issuer, API audience, expiry, nonempty `sub`, and a nonempty string-list `scp`. Local signed-token regressions cover these checks, including ID-token rejection when the audience is mistakenly set to the SPA Client ID. The frontend sends only access tokens; ID claims are display-only. Scopes do not replace membership-based authorization.

The database stores the exact **access-token `sub`**, not the ID-token subject or `uid`. An access-token subject may be username/email; this is not a fallback lookup on a separate email claim. Inspect Token Preview before provisioning and verify actual issued-token behavior during login. Changes to upstream subject mapping require coordinated membership migration; configure a stable mapping before provisioning if needed.

On sign-out, the frontend locks protected content, cancels transport work, blocks token use, clears query/mutation caches, stops Okta services, drains pending token acquisition, and clears local token storage before native SDK sign-out navigation. In-memory token snapshots retain logout/revocation hints for retries. Failed logout does not reopen private data. Only a successful SDK-validated callback clears the logged-out gate. API 401 responses lock the app with an explicit sign-in action.

**Local lock, remote SSO logout, and JWT revocation are distinct.** The SDK requests token revocation and remote session termination, but these can fail due to redirect configuration, network, or browser cookie restrictions. Even successful provider revocation does not guarantee immediate rejection by this stateless API, which verifies JWTs locally without per-request introspection or a revocation denylist. Already-issued tokens can remain usable until expiry. A failed/XHR fallback is not remote logout proof; a local lock is not cross-tab/global-session certification.

## Database compatibility

MySQL remains the default database/seed location. Local MariaDB uses `jdbc:mariadb:` and `DB_MIGRATION_LOCATION=classpath:db/mariadb`, selecting the patched MariaDB driver and compatible seed conversion. Both schemas keep UUIDs as BINARY(16); Hibernate explicitly uses BINARY UUID binding. Original MySQL migrations/checksums were preserved. MariaDB V1 is identical; V2 replaces UUID_TO_BIN with equivalent UNHEX/REPLACE conversion. Future schema changes must be mirrored across locations.

Do not change migration locations, repair failed history, or rewrite checksums blindly on an existing database. Inspect history and partial data and take a backup first. Local MariaDB 12.3.2 passed migration/schema validation, but Flyway 10.20.1 warns this version is beyond its tested range and its `WSREP_ON` probe is unavailable. This is not full compatibility or concurrency certification. MySQL 8.4 is the provided assessment configuration, while MariaDB is only a local compatibility option.

## Known limitations

These previously identified implementation/test gaps are retained through the documentation cleanup; a report of working local login does not independently close them.

- **Concurrency:** real MySQL parallel booking proof and concurrent schedule-edit tests remain necessary; the transaction-snapshot risk described above must be closed with database-backed evidence.
- **Delivery verification:** the backend integration suite uses H2. Run the complete authenticated and concurrent acceptance suite against MySQL 8 before submission.

Last recorded unit/component results and developer-reported runtime status are in [README.md](../README.md#tests-and-verification). Existing tests and working local flows are not full assessment sign-off. No new application tests or source changes were made by this documentation cleanup.
