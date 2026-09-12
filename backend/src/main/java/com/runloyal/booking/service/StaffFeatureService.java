package com.runloyal.booking.service;

import com.runloyal.booking.common.exception.ConflictException;
import com.runloyal.booking.domain.*;
import com.runloyal.booking.repo.AssignmentRepository;
import com.runloyal.booking.repo.AvailabilityRepository;
import com.runloyal.booking.repo.ServiceRepository;
import com.runloyal.booking.repo.StaffRepository;
import com.runloyal.booking.security.TenantContext;
import com.runloyal.booking.web.dto.request.*;
import jakarta.transaction.Transactional;
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

    public StaffFeatureService(
            TenantContext context,
            StaffRepository staffs,
            ServiceRepository services,
            AssignmentRepository assignments,
            AvailabilityRepository availabilities) {
        this.context = context;
        this.staffs = staffs;
        this.services = services;
        this.assignments = assignments;
        this.availabilities = availabilities;
    }

    public List<Staff> list() {
        return staffs.findByTenantId(context.tenantId());
    }

    @Transactional
    public Staff save(StaffCommand command, UUID id) {
        context.requireAdmin();
        var tenant = context.tenantId();
        Staff staff = id == null ? new Staff() : find(id);
        if (id == null)
            staff.tenantId = tenant;
        staff.name = command.name();
        staff.status = command.status() == null ? Model.Status.ACTIVE : command.status();
        return staffs.save(staff);
    }

    @Transactional
    public void assign(UUID serviceId, UUID staffId, boolean add) {
        context.requireAdmin();
        var tenant = context.tenantId();
        services.findByIdAndTenantId(serviceId, tenant).orElseThrow(this::notFound);
        find(staffId);
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

    @Transactional
    public StaffAvailability saveAvailability(UUID staffId, AvailabilityCommand command, UUID id) {
        context.requireAdmin();
        if (!command.startTime().isBefore(command.endTime()))
            throw new IllegalArgumentException("startTime must precede endTime");
        find(staffId);
        var all = availability(staffId);
        if (all.stream()
                .anyMatch(
                        value -> !value.id.equals(id)
                                && value.dayOfWeek.equals(command.dayOfWeek())
                                && value.type.equals(command.type())
                                && command.startTime().isBefore(value.endTime)
                                && command.endTime().isAfter(value.startTime)))
            throw new IllegalStateException("Overlapping availability window");
        StaffAvailability value = id == null ? new StaffAvailability() : availabilityById(id);
        value.tenantId = context.tenantId();
        value.staffId = staffId;
        value.dayOfWeek = command.dayOfWeek();
        value.startTime = command.startTime();
        value.endTime = command.endTime();
        value.type = command.type();
        return availabilities.save(value);
    }

    @Transactional
    public void deleteAvailability(UUID id) {
        context.requireAdmin();
        availabilities.delete(availabilityById(id));
    }

    public Staff find(UUID id) {
        return staffs.findByIdAndTenantId(id, context.tenantId()).orElseThrow(this::notFound);
    }

    public StaffAvailability availabilityById(UUID id) {
        return availabilities.findByIdAndTenantId(id, context.tenantId()).orElseThrow(this::notFound);
    }

    private NoSuchElementException notFound() {
        return new NoSuchElementException("Resource not found");
    }
}
