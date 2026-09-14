package com.runloyal.booking.service;

import com.runloyal.booking.common.exception.ConflictException;
import com.runloyal.booking.domain.*;
import com.runloyal.booking.repo.AssignmentRepository;
import com.runloyal.booking.repo.AvailabilityRepository;
import com.runloyal.booking.repo.ServiceRepository;
import com.runloyal.booking.repo.StaffRepository;
import com.runloyal.booking.repo.UnavailabilityRepository;
import com.runloyal.booking.security.TenantContext;
import com.runloyal.booking.web.dto.request.*;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class StaffFeatureService {
    private final TenantContext context;
    private final StaffRepository staffs;
    private final ServiceRepository services;
    private final AssignmentRepository assignments;
    private final AvailabilityRepository availabilities;
    private final UnavailabilityRepository unavailable;

    public StaffFeatureService(
            TenantContext context,
            StaffRepository staffs,
            ServiceRepository services,
            AssignmentRepository assignments,
            AvailabilityRepository availabilities, UnavailabilityRepository unavailable) {
        this.context = context;
        this.staffs = staffs;
        this.services = services;
        this.assignments = assignments;
        this.availabilities = availabilities;
        this.unavailable = unavailable;
    }

    public List<Staff> list() {
        return staffs.findByTenantId(context.tenantId());
    }

    /** Returns the actual persisted assignments; callers must never infer them from availability. */
    public List<Staff> assignedTo(UUID serviceId) {
        var tenant = context.tenantId();
        services.findByIdAndTenantId(serviceId, tenant).orElseThrow(this::notFound);
        var assigned = assignments.findByTenantIdAndServiceId(tenant, serviceId).stream()
            .map(assignment -> assignment.staffId).collect(java.util.stream.Collectors.toSet());
        return staffs.findByTenantId(tenant).stream().filter(staff -> assigned.contains(staff.id)).toList();
    }

        @Transactional(isolation = Isolation.READ_COMMITTED)
    public Staff save(StaffCommand command, UUID id) {
        context.requireAdmin();
        var tenant = context.tenantId();
        Staff staff = id == null ? new Staff() : lockStaff(id, tenant);
        if (id == null)
            staff.tenantId = tenant;
        staff.name = command.name();
        staff.status = command.status() == null ? Model.Status.ACTIVE : command.status();
        return staffs.save(staff);
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void assign(UUID serviceId, UUID staffId, boolean add) {
        context.requireAdmin();
        var tenant = context.tenantId();
        lockStaff(staffId, tenant);
        services.findByIdAndTenantId(serviceId, tenant).orElseThrow(this::notFound);
        var key = new StaffService.Key();
        key.tenantId = tenant;
        key.staffId = staffId;
        key.serviceId = serviceId;
        if (add) {
            if (assignments.existsByTenantIdAndStaffIdAndServiceId(tenant, staffId, serviceId))
                throw new ConflictException("Staff is already assigned to this service");
            var assignment = new StaffService();
            assignment.tenantId = tenant;
            assignment.staffId = staffId;
            assignment.serviceId = serviceId;
            assignments.save(assignment);
        } else
            assignments.deleteById(key);
    }

    public List<StaffAvailability> availability(UUID staffId) {
        find(staffId);
        return availabilities.findByTenantIdAndStaffId(context.tenantId(), staffId);
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public StaffAvailability saveAvailability(UUID staffId, AvailabilityCommand command, UUID id) {
        context.requireAdmin();
        if (!command.startTime().isBefore(command.endTime()))
            throw new IllegalArgumentException("startTime must precede endTime");
        var tenant = context.tenantId();
        lockStaff(staffId, tenant);
        StaffAvailability value = id == null ? new StaffAvailability() : availabilityById(id);
        if (id != null && !value.staffId.equals(staffId))
            throw notFound();
        var all = availabilities.findByTenantIdAndStaffId(tenant, staffId);
        if (all.stream()
                .anyMatch(
                        existing -> !existing.id.equals(id)
                            && existing.dayOfWeek.equals(command.dayOfWeek())
                            && existing.type.equals(command.type())
                            && command.startTime().isBefore(existing.endTime)
                            && command.endTime().isAfter(existing.startTime)))
            throw new IllegalStateException("Overlapping availability window");
        value.tenantId = tenant;
        value.staffId = staffId;
        value.dayOfWeek = command.dayOfWeek();
        value.startTime = command.startTime();
        value.endTime = command.endTime();
        value.type = command.type();
        return availabilities.save(value);
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void deleteAvailability(UUID id) {
        context.requireAdmin();
        var tenant = context.tenantId();
        var staffId = availabilities.findStaffIdByIdAndTenantId(id, tenant).orElseThrow(this::notFound);
        lockStaff(staffId, tenant);
        availabilities.delete(availabilities.findByIdAndTenantId(id, tenant).orElseThrow(this::notFound));
    }

    public Staff find(UUID id) {
        return staffs.findByIdAndTenantId(id, context.tenantId()).orElseThrow(this::notFound);
    }

    public StaffAvailability availabilityById(UUID id) {
        return availabilities.findByIdAndTenantId(id, context.tenantId()).orElseThrow(this::notFound);
    }

    public List<StaffUnavailability> unavailability(UUID staffId) {
        find(staffId);
        return unavailable.findByTenantIdAndStaffId(context.tenantId(), staffId);
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public StaffUnavailability saveUnavailability(UUID staffId, UnavailabilityCommand command, UUID id) {
        context.requireAdmin();
        if (!command.startAt().isBefore(command.endAt()))
            throw new IllegalArgumentException("startAt must precede endAt");
        var tenant = context.tenantId();
        lockStaff(staffId, tenant);
        StaffUnavailability value = id == null ? new StaffUnavailability()
                : unavailable.findByIdAndTenantId(id, tenant).orElseThrow(this::notFound);
        if (id != null && !value.staffId.equals(staffId)) throw notFound();
        value.tenantId = tenant;
        value.staffId = staffId;
        value.startAt = command.startAt();
        value.endAt = command.endAt();
        value.reason = command.reason() == null ? "" : command.reason().strip();
        return unavailable.save(value);
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void deleteUnavailability(UUID staffId, UUID id) {
        context.requireAdmin();
        var tenant = context.tenantId();
        lockStaff(staffId, tenant);
        var value = unavailable.findByIdAndTenantId(id, tenant).orElseThrow(this::notFound);
        if (!value.staffId.equals(staffId)) throw notFound();
        unavailable.delete(value);
    }

    private NoSuchElementException notFound() {
        return new NoSuchElementException("Resource not found");
    }

    // All staff state, assignment and schedule writes use the booking mutex. Read-only paths
    // deliberately do not lock. READ_COMMITTED ensures post-lock queries see the prior writer.
    private Staff lockStaff(UUID id, UUID tenant) {
        return staffs.lockByIdAndTenant(id, tenant).orElseThrow(this::notFound);
    }
}
