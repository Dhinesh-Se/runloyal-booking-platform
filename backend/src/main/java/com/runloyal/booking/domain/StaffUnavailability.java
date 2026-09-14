package com.runloyal.booking.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** A dated exception to a staff member's recurring availability. */
@Entity
@Table(name = "staff_unavailability")
public class StaffUnavailability {
    @Id public UUID id = UUID.randomUUID();

    @Column(name = "tenant_id", nullable = false) public UUID tenantId;
    @Column(name = "staff_id", nullable = false) public UUID staffId;
    @Column(name = "start_at", nullable = false) public Instant startAt;
    @Column(name = "end_at", nullable = false) public Instant endAt;
    @Column(nullable = false) public String reason = "";
}
