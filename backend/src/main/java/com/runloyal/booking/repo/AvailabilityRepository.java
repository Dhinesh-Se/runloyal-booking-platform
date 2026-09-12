package com.runloyal.booking.repo;

import com.runloyal.booking.domain.StaffAvailability;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AvailabilityRepository extends JpaRepository<StaffAvailability, UUID> {
    List<StaffAvailability> findByTenantIdAndStaffId(UUID tenantId, UUID staffId);

    Optional<StaffAvailability> findByIdAndTenantId(UUID id, UUID tenantId);
}
