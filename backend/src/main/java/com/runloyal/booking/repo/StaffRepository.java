package com.runloyal.booking.repo;

import com.runloyal.booking.domain.Staff;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface StaffRepository extends JpaRepository<Staff, UUID> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from Staff s where s.id=:id and s.tenantId=:tenant")
    Optional<Staff> lockByIdAndTenant(@Param("id") UUID id, @Param("tenant") UUID tenantId);

    Optional<Staff> findByIdAndTenantId(UUID id, UUID tenantId);

    List<Staff> findByTenantId(UUID tenantId);
}
