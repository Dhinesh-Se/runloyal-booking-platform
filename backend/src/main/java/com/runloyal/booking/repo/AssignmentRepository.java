package com.runloyal.booking.repo;

import com.runloyal.booking.domain.StaffService;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AssignmentRepository extends JpaRepository<StaffService, StaffService.Key> {
    boolean existsByTenantIdAndStaffIdAndServiceId(java.util.UUID tenantId, java.util.UUID staffId,
            java.util.UUID serviceId);
}
