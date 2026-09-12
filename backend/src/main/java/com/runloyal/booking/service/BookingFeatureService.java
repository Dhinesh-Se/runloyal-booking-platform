package com.runloyal.booking.service;

import com.runloyal.booking.common.exception.ConflictException;
import com.runloyal.booking.domain.*;
import com.runloyal.booking.repo.AssignmentRepository;
import com.runloyal.booking.repo.AvailabilityRepository;
import com.runloyal.booking.repo.BookingRepository;
import com.runloyal.booking.repo.ServiceRepository;
import com.runloyal.booking.repo.StaffRepository;
import com.runloyal.booking.repo.TenantRepository;
import com.runloyal.booking.security.TenantContext;
import com.runloyal.booking.web.dto.request.BookingCommand;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class BookingFeatureService {
    private final TenantContext context;
    private final TenantRepository tenants;
    private final ServiceRepository services;
    private final StaffRepository staffs;
    private final AssignmentRepository assignments;
    private final AvailabilityRepository availabilities;
    private final BookingRepository bookings;
    private final AvailabilityEngine engine = new AvailabilityEngine();

    public BookingFeatureService(
            TenantContext context,
            TenantRepository tenants,
            ServiceRepository services,
            StaffRepository staffs,
            AssignmentRepository assignments,
            AvailabilityRepository availabilities,
            BookingRepository bookings) {
        this.context = context;
        this.tenants = tenants;
        this.services = services;
        this.staffs = staffs;
        this.assignments = assignments;
        this.availabilities = availabilities;
        this.bookings = bookings;
    }

    public List<Staff> available(UUID serviceId, Instant start) {
        var tenant = context.tenantId();
        var service = find(services.findByIdAndTenantId(serviceId, tenant));
        return staffs.findByTenantId(tenant).stream()
                .filter(
                        staff -> eligible(
                                staff,
                                service,
                                start,
                                bookings.conflicts(
                                        tenant, staff.id, start, start.plusSeconds(service.durationMinutes * 60L))))
                .toList();
    }

    public List<AvailableSlot> availableSlots(UUID serviceId, Instant from, Instant to) {
        if (!from.isBefore(to))
            throw new IllegalArgumentException("from must precede to");
        var tenant = context.tenantId();
        var service = find(services.findByIdAndTenantId(serviceId, tenant));
        var zone = zone();
        var local = LocalDateTime.ofInstant(from, zone).withSecond(0).withNano(0);
        int minuteRemainder = local.getMinute() % 30;
        if (minuteRemainder != 0)
            local = local.plusMinutes(30 - minuteRemainder);
        var endLocal = LocalDateTime.ofInstant(to, zone);
        var slots = new java.util.ArrayList<AvailableSlot>();
        while (local.isBefore(endLocal)) {
            var start = local.atZone(zone).toInstant();
            if (!start.plusSeconds(service.durationMinutes * 60L).isAfter(to)) {
                var eligibleStaff = available(serviceId, start);
                if (!eligibleStaff.isEmpty()) {
                    slots.add(new AvailableSlot(
                            start,
                            start.plusSeconds(service.durationMinutes * 60L),
                            eligibleStaff));
                }
            }
            local = local.plusMinutes(30);
        }
        return slots;
    }

    public List<Booking> calendar(Instant from, Instant to) {
        if (!from.isBefore(to))
            throw new IllegalArgumentException("from must precede to");
        return bookings.calendar(context.tenantId(), from, to);
    }

    @Transactional
    public Booking book(BookingCommand command) {
        context.requireAdmin();
        var tenant = context.tenantId();
        var staff = find(staffs.lockByIdAndTenant(command.staffId(), tenant));
        var service = find(services.findByIdAndTenantId(command.serviceId(), tenant));
        Instant end = command.startAt().plusSeconds(service.durationMinutes * 60L);
        if (!eligible(
                staff,
                service,
                command.startAt(),
                bookings.conflicts(tenant, staff.id, command.startAt(), end)))
            throw new ConflictException("Requested slot is unavailable");
        var booking = new Booking();
        booking.tenantId = tenant;
        booking.staffId = staff.id;
        booking.serviceId = service.id;
        booking.startAt = command.startAt();
        booking.endAt = end;
        booking.status = Model.BookingStatus.CONFIRMED;
        booking.customerName = command.customerName();
        booking.petName = command.petName() == null ? "" : command.petName();
        return bookings.save(booking);
    }

    public Booking findBooking(UUID id) {
        return find(bookings.findByIdAndTenantId(id, context.tenantId()));
    }

    @Transactional
    public Booking cancel(UUID id) {
        context.requireAdmin();
        var booking = findBooking(id);
        if (booking.status == Model.BookingStatus.CANCELLED)
            throw new ConflictException("Booking already cancelled");
        booking.status = Model.BookingStatus.CANCELLED;
        return booking;
    }

    private boolean eligible(
            Staff staff, ServiceOffering service, Instant start, List<Booking> conflicts) {
        var tenant = context.tenantId();
        var rules = availabilities.findByTenantIdAndStaffId(tenant, staff.id);
        return engine.eligible(
                staff,
                service,
                assignments.existsByTenantIdAndStaffIdAndServiceId(tenant, staff.id, service.id),
                rules,
                conflicts,
                start,
                zone());
    }

    private ZoneId zone() {
        return ZoneId.of(find(tenants.findById(context.tenantId())).timezone);
    }

    private <T> T find(java.util.Optional<T> value) {
        return value.orElseThrow(() -> new NoSuchElementException("Resource not found"));
    }

    public record AvailableSlot(Instant startAt, Instant endAt, List<Staff> availableStaff) {
    }
}
