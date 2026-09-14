CREATE TABLE staff_unavailability (
    id BINARY(16) PRIMARY KEY,
    tenant_id BINARY(16) NOT NULL,
    staff_id BINARY(16) NOT NULL,
    start_at TIMESTAMP(6) NOT NULL,
    end_at TIMESTAMP(6) NOT NULL,
    reason VARCHAR(240) NOT NULL DEFAULT '',
    CONSTRAINT ck_unavailability_times CHECK (start_at < end_at),
    CONSTRAINT fk_unavailability_tenant_staff
        FOREIGN KEY (tenant_id, staff_id) REFERENCES staff (tenant_id, id),
    INDEX ix_unavailability_overlap (tenant_id, staff_id, start_at, end_at)
);
