package com.runloyal.booking.repo;

import com.runloyal.booking.domain.*;
import jakarta.persistence.LockModeType;
import java.time.*;
import java.util.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

public final class Repos {
    private Repos() {
    }

    public interface Tenants extends JpaRepository<Tenant, UUID> {
    }

    public interface Users extends JpaRepository<AppUser, UUID> {
        Optional<AppUser> findByOktaSubject(String s);
    }

    public interface Services extends JpaRepository<ServiceOffering, UUID> {
        Optional<ServiceOffering> findByIdAndTenantId(UUID id, UUID t);

        List<ServiceOffering> findByTenantId(UUID t);
    }

    public interface Staffs extends JpaRepository<Staff, UUID> {
        @Lock(LockModeType.PESSIMISTIC_WRITE)
        @Query("select s from Staff s where s.id=:id and s.tenantId=:tenant")
        Optional<Staff> lockByIdAndTenant(@Param("id") UUID id, @Param("tenant") UUID tenant);

        Optional<Staff> findByIdAndTenantId(UUID id, UUID t);

        List<Staff> findByTenantId(UUID t);
    }

    public interface Assignments extends JpaRepository<StaffService, StaffService.Key> {
        boolean existsByTenantIdAndStaffIdAndServiceId(UUID t, UUID staff, UUID service);
    }

    public interface Availabilities extends JpaRepository<StaffAvailability, UUID> {
        List<StaffAvailability> findByTenantIdAndStaffId(UUID t, UUID s);

        Optional<StaffAvailability> findByIdAndTenantId(UUID i, UUID t);
    }

    public interface Bookings extends JpaRepository<Booking, UUID> {
        Optional<Booking> findByIdAndTenantId(UUID i, UUID t);

        @Query("select b from Booking b where b.tenantId=:t and b.staffId=:s and b.status='CONFIRMED' and b.startAt < :end and b.endAt > :start")
        List<Booking> conflicts(
                @Param("t") UUID t,
                @Param("s") UUID s,
                @Param("start") Instant start,
                @Param("end") Instant end);

        @Query("select b from Booking b where b.tenantId=:t and b.startAt < :to and b.endAt > :from order by b.startAt")
        List<Booking> calendar(
                @Param("t") UUID t, @Param("from") Instant from, @Param("to") Instant to);
    }
}
