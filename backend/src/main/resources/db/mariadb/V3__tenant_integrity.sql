-- Additive only: fail on pre-existing invalid data rather than rewriting booking history.
-- Overlap prevention remains transactional, not an equality-based
-- UNIQUE(staff_id, start_at, end_at) constraint.
ALTER TABLE users ADD CONSTRAINT uq_users_tenant_id UNIQUE (tenant_id, id);
ALTER TABLE staff ADD CONSTRAINT uq_staff_tenant_id UNIQUE (tenant_id, id);
ALTER TABLE services ADD CONSTRAINT uq_services_tenant_id UNIQUE (tenant_id, id);

-- MATCH SIMPLE semantics preserve staff.user_id = NULL for staff without a login.
ALTER TABLE staff ADD CONSTRAINT fk_staff_tenant_user
    FOREIGN KEY (tenant_id, user_id) REFERENCES users (tenant_id, id);
ALTER TABLE staff_services
    ADD CONSTRAINT fk_assignment_tenant_staff FOREIGN KEY (tenant_id, staff_id) REFERENCES staff (tenant_id, id),
    ADD CONSTRAINT fk_assignment_tenant_service FOREIGN KEY (tenant_id, service_id) REFERENCES services (tenant_id, id);
ALTER TABLE staff_availability ADD CONSTRAINT fk_availability_tenant_staff
    FOREIGN KEY (tenant_id, staff_id) REFERENCES staff (tenant_id, id);
ALTER TABLE bookings
    ADD CONSTRAINT ck_booking_times CHECK (start_at < end_at),
    ADD CONSTRAINT fk_booking_tenant_staff FOREIGN KEY (tenant_id, staff_id) REFERENCES staff (tenant_id, id),
    ADD CONSTRAINT fk_booking_tenant_service FOREIGN KEY (tenant_id, service_id) REFERENCES services (tenant_id, id);