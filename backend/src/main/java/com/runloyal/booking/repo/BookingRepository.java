package com.runloyal.booking.repo;

import com.runloyal.booking.domain.Booking;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface BookingRepository extends JpaRepository<Booking, UUID> {
    Optional<Booking> findByIdAndTenantId(UUID id, UUID tenantId);

    @Query("select b.staffId from Booking b where b.id=:id and b.tenantId=:tenant")
    Optional<UUID> findStaffIdByIdAndTenantId(@Param("id") UUID id, @Param("tenant") UUID tenantId);

    @Query("select b from Booking b where b.tenantId=:tenant and b.status='CONFIRMED' and b.startAt < :to and b.endAt > :from")
    List<Booking> confirmedInRange(@Param("tenant") UUID tenantId, @Param("from") Instant from,
            @Param("to") Instant to);

    @Query("select b from Booking b where b.tenantId=:tenant and b.staffId=:staff and b.status='CONFIRMED' and b.startAt < :end and b.endAt > :start")
    List<Booking> conflicts(@Param("tenant") UUID tenantId, @Param("staff") UUID staffId,
            @Param("start") Instant start, @Param("end") Instant end);

    @Query("select b from Booking b where b.tenantId=:tenant and b.startAt < :to and b.endAt > :from order by b.startAt")
    List<Booking> calendar(@Param("tenant") UUID tenantId, @Param("from") Instant from,
            @Param("to") Instant to);
}
