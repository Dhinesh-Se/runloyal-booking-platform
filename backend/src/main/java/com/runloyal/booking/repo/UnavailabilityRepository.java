package com.runloyal.booking.repo;

import com.runloyal.booking.domain.StaffUnavailability;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UnavailabilityRepository extends JpaRepository<StaffUnavailability, UUID> {
    List<StaffUnavailability> findByTenantIdAndStaffId(UUID tenantId, UUID staffId);
    Optional<StaffUnavailability> findByIdAndTenantId(UUID id, UUID tenantId);

    @Query("select u from StaffUnavailability u where u.tenantId=:tenant and u.staffId in :staff "
            + "and u.startAt < :to and u.endAt > :from")
    List<StaffUnavailability> inRange(@Param("tenant") UUID tenantId, @Param("staff") Collection<UUID> staffIds,
            @Param("from") Instant from, @Param("to") Instant to);
}
