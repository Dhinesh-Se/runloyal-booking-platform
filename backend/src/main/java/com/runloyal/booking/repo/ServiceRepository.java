package com.runloyal.booking.repo;

import com.runloyal.booking.domain.ServiceOffering;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ServiceRepository extends JpaRepository<ServiceOffering, UUID> {
    Optional<ServiceOffering> findByIdAndTenantId(UUID id, UUID tenantId);

    List<ServiceOffering> findByTenantId(UUID tenantId);
}
