# Technical notes

- **Tenant isolation:** the Auth0 JWT `sub` is resolved to an active server-side `users` row. `TenantContext` supplies the only tenant id used by application services; request tenant ids do not exist. Lookups use `(id, tenant_id)`.
- **Time:** tenants store IANA zones. Bookings persist UTC `Instant`; APIs accept/return ISO-8601 instants. Availability is calculated in tenant local time.
- **Concurrency:** booking is transactional and locks the tenant-scoped staff row with pessimistic write locking before reloading all state and checking `start < end && end > start`. This serializes conflicting writes per staff.
- **Slots:** consumers call available-staff for a candidate start. UI calendars should offer 30-minute boundaries; the engine always verifies the complete service duration.
- **Calendar blocks:** `GET /api/services/{serviceId}/available-slots?from=...&to=...` generates 30-minute candidate starts in the tenant timezone and returns only slots with at least one eligible staff member. The response includes the service-duration-derived `endAt` and eligible staff list.
