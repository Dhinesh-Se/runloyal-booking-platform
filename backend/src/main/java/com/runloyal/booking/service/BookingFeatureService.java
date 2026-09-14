package com.runloyal.booking.service;

import com.runloyal.booking.common.exception.ConflictException;
import com.runloyal.booking.domain.*;
import com.runloyal.booking.repo.AssignmentRepository;
import com.runloyal.booking.repo.AvailabilityRepository;
import com.runloyal.booking.repo.BookingRepository;
import com.runloyal.booking.repo.ServiceRepository;
import com.runloyal.booking.repo.StaffRepository;
import com.runloyal.booking.repo.TenantRepository;
import com.runloyal.booking.repo.UnavailabilityRepository;
import com.runloyal.booking.security.TenantContext;
import com.runloyal.booking.web.dto.request.BookingCommand;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.*;
import java.util.stream.Collectors;
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
    private final UnavailabilityRepository unavailable;
    private final AvailabilityEngine engine = new AvailabilityEngine();

    public BookingFeatureService(
            TenantContext context,
            TenantRepository tenants,
            ServiceRepository services,
            StaffRepository staffs,
            AssignmentRepository assignments,
            AvailabilityRepository availabilities,
            BookingRepository bookings, UnavailabilityRepository unavailable) {
        this.context = context;
        this.tenants = tenants;
        this.services = services;
        this.staffs = staffs;
        this.assignments = assignments;
        this.availabilities = availabilities;
        this.bookings = bookings;
        this.unavailable = unavailable;
    }

    @Transactional(readOnly = true)
    public List<Staff> available(UUID serviceId, Instant start) {
        var tenant = context.tenantId();
        var service = find(services.findByIdAndTenantId(serviceId, tenant));
        var data = loadAvailability(tenant, serviceId, start, start.plusSeconds(service.durationMinutes * 60L));
        return eligibleStaff(service, start, data);
    }

    @Transactional(readOnly = true)
    public List<AvailableSlot> availableSlots(UUID serviceId, Instant from, Instant to) {
        validateRange(from, to);
        var tenant = context.tenantId();
        var service = find(services.findByIdAndTenantId(serviceId, tenant));
        var data = loadAvailability(tenant, serviceId, from, to);
        // Build actual instants on the local half-hour grid. Unlike local.plusMinutes().atZone(),
        // valid offsets enumerate BOTH repeated occurrences and omit nonexistent gap slots.
        // Sorting instants keeps the response chronological even across a backwards clock change.
        var candidates = new TreeSet<Instant>();
        var lastDate = to.atZone(data.zone).toLocalDate();
        for (var date = from.atZone(data.zone).toLocalDate(); !date.isAfter(lastDate); date = date.plusDays(1)) {
            for (int minute = 0; minute < 24 * 60; minute += 30) {
                var local = date.atTime(LocalTime.of(minute / 60, minute % 60));
                for (var offset : data.zone.getRules().getValidOffsets(local)) {
                    var start = local.toInstant(offset);
                    if (!start.isBefore(from) && start.isBefore(to))
                        candidates.add(start);
                }
            }
        }
        var slots = new ArrayList<AvailableSlot>();
        for (var start : candidates) {
            var end = start.plusSeconds(service.durationMinutes * 60L);
            if (end.isAfter(to))
                continue;
            var eligibleStaff = eligibleStaff(service, start, data);
            if (!eligibleStaff.isEmpty())
                slots.add(new AvailableSlot(start, end, eligibleStaff));
        }
        return slots;
    }

    @Transactional(readOnly = true)
    public List<Booking> calendar(Instant from, Instant to) {
        validateRange(from, to);
        return bookings.calendar(context.tenantId(), from, to);
    }

    // Membership reads precede the staff lock. READ_COMMITTED is essential: after waiting for
    // that lock, a MySQL REPEATABLE_READ snapshot could otherwise hide a just-committed booking.
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public Booking book(BookingCommand command) {
        context.requireAdmin();
        var tenant = context.tenantId();
        var staff = find(staffs.lockByIdAndTenant(command.staffId(), tenant));
        var service = find(services.findByIdAndTenantId(command.serviceId(), tenant));
        Instant end = command.startAt().plusSeconds(service.durationMinutes * 60L);
        if (!eligible(
            tenant,
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
        // Snapshot the duration at creation. Later service edits only affect future bookings;
        // existing booking intervals (including calendar/conflict checks) remain immutable.
        booking.endAt = end;
        booking.status = Model.BookingStatus.CONFIRMED;
        booking.customerName = command.customerName();
        booking.petName = command.petName() == null ? "" : command.petName();
        return bookings.save(booking);
    }

    public Booking findBooking(UUID id) {
        return find(bookings.findByIdAndTenantId(id, context.tenantId()));
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public Booking cancel(UUID id) {
        context.requireAdmin();
        var tenant = context.tenantId();
        // Read only the owner key before locking, not a managed entity with potentially stale state.
        var staffId = find(bookings.findStaffIdByIdAndTenantId(id, tenant));
        find(staffs.lockByIdAndTenant(staffId, tenant));
        var booking = find(bookings.findByIdAndTenantId(id, tenant));
        if (booking.status == Model.BookingStatus.CANCELLED)
            throw new ConflictException("Booking already cancelled");
        booking.status = Model.BookingStatus.CANCELLED;
        return booking;
    }

    private boolean eligible(
            UUID tenant, Staff staff, ServiceOffering service, Instant start, List<Booking> conflicts) {
        var rules = availabilities.findByTenantIdAndStaffId(tenant, staff.id);
        return engine.eligible(
                staff,
                service,
                assignments.existsByTenantIdAndStaffIdAndServiceId(tenant, staff.id, service.id),
                rules,
                conflicts,
                unavailable.inRange(tenant, List.of(staff.id), start,
                        start.plusSeconds(service.durationMinutes * 60L)),
                start,
                zone(tenant));
    }

    private ZoneId zone(UUID tenant) {
        return ZoneId.of(find(tenants.findById(tenant)).timezone);
    }

    private void validateRange(Instant from, Instant to) {
        if (from == null || to == null || !from.isBefore(to))
            throw new IllegalArgumentException("from must precede to");
        if (Duration.between(from, to).compareTo(Duration.ofDays(31)) > 0)
            throw new IllegalArgumentException("Range must not exceed 31 days");
    }

    private AvailabilityData loadAvailability(UUID tenant, UUID serviceId, Instant from, Instant to) {
        var assigned = assignments.findByTenantIdAndServiceId(tenant, serviceId).stream()
                .map(a -> a.staffId).collect(Collectors.toSet());
        var staff = staffs.findByTenantId(tenant).stream()
                .filter(s -> s.status == Model.Status.ACTIVE && assigned.contains(s.id)).toList();
        var rules = staff.isEmpty() ? Map.<UUID, List<StaffAvailability>>of()
                : availabilities.findByTenantIdAndStaffIdIn(tenant, staff.stream().map(s -> s.id).toList())
                        .stream().collect(Collectors.groupingBy(r -> r.staffId));
        var confirmed = staff.isEmpty() ? Map.<UUID, List<Booking>>of()
                : bookings.confirmedInRange(tenant, from, to).stream()
                        .collect(Collectors.groupingBy(b -> b.staffId));
        var exceptions = staff.isEmpty() ? Map.<UUID, List<StaffUnavailability>>of()
                : unavailable.inRange(tenant, staff.stream().map(s -> s.id).toList(), from, to).stream()
                        .collect(Collectors.groupingBy(u -> u.staffId));
        return new AvailabilityData(staff, rules, confirmed, exceptions, zone(tenant));
    }

    private List<Staff> eligibleStaff(ServiceOffering service, Instant start, AvailabilityData data) {
        return data.staff.stream().filter(staff -> engine.eligible(staff, service, true,
                data.rules.getOrDefault(staff.id, List.of()),
                data.confirmed.getOrDefault(staff.id, List.of()), data.exceptions.getOrDefault(staff.id, List.of()),
                start, data.zone)).toList();
    }

    private record AvailabilityData(List<Staff> staff, Map<UUID, List<StaffAvailability>> rules,
            Map<UUID, List<Booking>> confirmed, Map<UUID, List<StaffUnavailability>> exceptions, ZoneId zone) {}

    private <T> T find(java.util.Optional<T> value) {
        return value.orElseThrow(() -> new NoSuchElementException("Resource not found"));
    }

    public record AvailableSlot(Instant startAt, Instant endAt, List<Staff> availableStaff) {
    }
}
