package com.runloyal.booking.repo;

import com.runloyal.booking.domain.StaffAvailability;
import java.util.List;
import java.util.Collection;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AvailabilityRepository extends JpaRepository<StaffAvailability, UUID> {
    List<StaffAvailability> findByTenantIdAndStaffId(UUID tenantId, UUID staffId);

    List<StaffAvailability> findByTenantIdAndStaffIdIn(UUID tenantId, Collection<UUID> staffIds);

    @Query("select a.staffId from StaffAvailability a where a.id=:id and a.tenantId=:tenant")
    Optional<UUID> findStaffIdByIdAndTenantId(@Param("id") UUID id, @Param("tenant") UUID tenantId);

    Optional<StaffAvailability> findByIdAndTenantId(UUID id, UUID tenantId);
}
