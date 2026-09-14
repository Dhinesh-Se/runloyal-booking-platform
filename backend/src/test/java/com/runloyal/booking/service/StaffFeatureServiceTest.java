package com.runloyal.booking.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.runloyal.booking.common.exception.ConflictException;
import com.runloyal.booking.domain.*;
import com.runloyal.booking.repo.*;
import com.runloyal.booking.security.TenantContext;
import com.runloyal.booking.web.dto.request.AvailabilityCommand;
import com.runloyal.booking.web.dto.request.StaffCommand;
import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.*;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;

class StaffFeatureServiceTest {
    private final UUID tenantId = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private final TenantContext context = mock(TenantContext.class);
    private final StaffRepository staffs = mock(StaffRepository.class);
    private final ServiceRepository services = mock(ServiceRepository.class);
    private final AssignmentRepository assignments = mock(AssignmentRepository.class);
    private final AvailabilityRepository availabilities = mock(AvailabilityRepository.class);
    private final StaffFeatureService subject = new StaffFeatureService(context, staffs, services, assignments, availabilities);
    private final Staff staff = new Staff();
    private final ServiceOffering offering = new ServiceOffering();

    @BeforeEach
    void setUp() {
        staff.tenantId = tenantId;
        staff.name = "Original";
        staff.status = Model.Status.ACTIVE;
        offering.tenantId = tenantId;
        offering.status = Model.Status.ACTIVE;
        when(context.tenantId()).thenReturn(tenantId);
    }

    @AfterEach
    void neverUsesUnscopedRepositoryReads() {
        for (var repository : List.of(staffs, services, assignments, availabilities)) {
            for (var invocation : mockingDetails(repository).getInvocations()) {
                assertFalse(Set.of("findById", "findAll", "findAllById", "getById", "getOne", "getReferenceById")
                        .contains(invocation.getMethod().getName()), invocation::toString);
            }
        }
    }

    @Test
    void listReturnsOnlyAuthenticatedTenantResultsIncludingInactiveStaffWithoutLocking() {
        var inactive = new Staff();
        inactive.tenantId = tenantId;
        inactive.status = Model.Status.INACTIVE;
        when(staffs.findByTenantId(tenantId)).thenReturn(List.of(staff, inactive));

        assertEquals(List.of(staff, inactive), subject.list());

        verify(staffs).findByTenantId(tenantId);
        verifyNoMoreInteractions(staffs);
        verifyNoInteractions(services, assignments, availabilities);
        verifyReadOnlyAccess();
    }

    @Test
    void findReturnsTenantScopedStaffWithoutLocking() {
        when(staffs.findByIdAndTenantId(staff.id, tenantId)).thenReturn(Optional.of(staff));
        assertSame(staff, subject.find(staff.id));
        verify(staffs).findByIdAndTenantId(staff.id, tenantId);
        verifyNoMoreInteractions(staffs);
        verifyNoInteractions(services, assignments, availabilities);
        verifyReadOnlyAccess();
    }

    @Test
    void assignedToValidatesServiceThenUsesPersistedAssignmentsNotAvailabilityOrActiveStatus() {
        staff.status = Model.Status.INACTIVE;
        var unassigned = new Staff();
        unassigned.tenantId = tenantId;
        unassigned.status = Model.Status.ACTIVE;
        var otherTenantStaff = new Staff();
        otherTenantStaff.tenantId = UUID.randomUUID();
        when(services.findByIdAndTenantId(offering.id, tenantId)).thenReturn(Optional.of(offering));
        when(assignments.findByTenantIdAndServiceId(tenantId, offering.id))
                .thenReturn(List.of(assignment(staff.id), assignment(staff.id), assignment(otherTenantStaff.id)));
        when(staffs.findByTenantId(tenantId)).thenReturn(List.of(staff, unassigned));

        assertEquals(List.of(staff), subject.assignedTo(offering.id));

        var order = inOrder(services, assignments, staffs);
        order.verify(services).findByIdAndTenantId(offering.id, tenantId);
        order.verify(assignments).findByTenantIdAndServiceId(tenantId, offering.id);
        order.verify(staffs).findByTenantId(tenantId);
        verifyNoMoreInteractions(services, assignments, staffs);
        verifyNoInteractions(availabilities);
        verifyReadOnlyAccess();
    }

    @Test
    void assignedToWithNoAssignmentsReturnsEmptyWithoutEligibilityQueries() {
        when(services.findByIdAndTenantId(offering.id, tenantId)).thenReturn(Optional.of(offering));
        when(assignments.findByTenantIdAndServiceId(tenantId, offering.id)).thenReturn(List.of());
        when(staffs.findByTenantId(tenantId)).thenReturn(List.of(staff));
        assertTrue(subject.assignedTo(offering.id).isEmpty());
        verify(assignments).findByTenantIdAndServiceId(tenantId, offering.id);
        verifyNoMoreInteractions(assignments);
        verifyNoInteractions(availabilities);
        verifyReadOnlyAccess();
    }

    @Test
    void availabilityChecksTenantStaffBeforeReadingTenantStaffRulesWithoutLocking() {
        var rule = rule("09:00", "17:00", Model.AvailabilityType.WORKING);
        when(staffs.findByIdAndTenantId(staff.id, tenantId)).thenReturn(Optional.of(staff));
        when(availabilities.findByTenantIdAndStaffId(tenantId, staff.id)).thenReturn(List.of(rule));

        assertEquals(List.of(rule), subject.availability(staff.id));

        var order = inOrder(staffs, availabilities);
        order.verify(staffs).findByIdAndTenantId(staff.id, tenantId);
        order.verify(availabilities).findByTenantIdAndStaffId(tenantId, staff.id);
        verifyNoMoreInteractions(staffs, availabilities);
        verifyNoInteractions(services, assignments);
        verifyReadOnlyAccess();
    }

    @Test
    void availabilityByIdUsesTenantScopeWithoutLocking() {
        var rule = rule("09:00", "17:00", Model.AvailabilityType.WORKING);
        when(availabilities.findByIdAndTenantId(rule.id, tenantId)).thenReturn(Optional.of(rule));
        assertSame(rule, subject.availabilityById(rule.id));
        verify(availabilities).findByIdAndTenantId(rule.id, tenantId);
        verifyNoMoreInteractions(availabilities);
        verifyNoInteractions(staffs, services, assignments);
        verifyReadOnlyAccess();
    }

    @Test
    void createUsesAuthenticatedTenantDefaultsActiveAndDoesNotLockANonexistentRow() {
        when(staffs.save(any(Staff.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var result = subject.save(new StaffCommand("New staff", null), null);

        assertNotNull(result.id);
        assertEquals(tenantId, result.tenantId);
        assertEquals("New staff", result.name);
        assertEquals(Model.Status.ACTIVE, result.status);
        var order = inOrder(context, staffs);
        order.verify(context).requireAdmin();
        order.verify(context).tenantId();
        order.verify(staffs).save(result);
        verifyNoMoreInteractions(context, staffs);
        verifyNoInteractions(services, assignments, availabilities);
    }

    @ParameterizedTest
    @EnumSource(Model.Status.class)
    void updateLocksAfterMembershipAndPreservesIdentityTenantAndUserLink(Model.Status status) {
        var userId = UUID.randomUUID();
        staff.userId = userId;
        stubLock();
        when(staffs.save(any(Staff.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var result = subject.save(new StaffCommand("Renamed", status), staff.id);

        assertSame(staff, result);
        assertEquals(tenantId, result.tenantId);
        assertEquals(userId, result.userId);
        assertEquals("Renamed", result.name);
        assertEquals(status, result.status);
        var order = inOrder(context, staffs);
        order.verify(context).requireAdmin();
        order.verify(context).tenantId();
        order.verify(staffs).lockByIdAndTenant(staff.id, tenantId);
        order.verify(staffs).save(staff);
        verifyNoMoreInteractions(context, staffs);
        verifyNoInteractions(services, assignments, availabilities);
    }

    @Test
    void createHonorsExplicitInactiveStatusAndUpdateDefaultsNullStatusToActive() {
        when(staffs.save(any(Staff.class))).thenAnswer(invocation -> invocation.getArgument(0));
        var created = subject.save(new StaffCommand("Inactive staff", Model.Status.INACTIVE), null);
        assertEquals(Model.Status.INACTIVE, created.status);
        assertEquals(tenantId, created.tenantId);
        staff.status = Model.Status.INACTIVE;
        stubLock();
        var updated = subject.save(new StaffCommand("Reactivated", null), staff.id);
        assertSame(staff, updated);
        assertEquals(Model.Status.ACTIVE, updated.status);
        verify(staffs).lockByIdAndTenant(staff.id, tenantId);
    }

    @Test
    void assignLocksStaffBeforeServiceAndDuplicateChecksThenSavesTenantCompositeKey() {
        stubLockAndService();

        subject.assign(offering.id, staff.id, true);

        var captured = ArgumentCaptor.forClass(StaffService.class);
        var order = inOrder(context, staffs, services, assignments);
        order.verify(context).requireAdmin();
        order.verify(context).tenantId();
        order.verify(staffs).lockByIdAndTenant(staff.id, tenantId);
        order.verify(services).findByIdAndTenantId(offering.id, tenantId);
        order.verify(assignments).existsByTenantIdAndStaffIdAndServiceId(tenantId, staff.id, offering.id);
        order.verify(assignments).save(captured.capture());
        assertEquals(tenantId, captured.getValue().tenantId);
        assertEquals(staff.id, captured.getValue().staffId);
        assertEquals(offering.id, captured.getValue().serviceId);
        verifyNoMoreInteractions(context, staffs, services, assignments);
        verifyNoInteractions(availabilities);
    }

    @Test
    void duplicateAssignmentConflictsAfterLockAndNeverSaves() {
        stubLockAndService();
        when(assignments.existsByTenantIdAndStaffIdAndServiceId(tenantId, staff.id, offering.id)).thenReturn(true);
        assertThrows(ConflictException.class, () -> subject.assign(offering.id, staff.id, true));
        var order = inOrder(staffs, services, assignments);
        order.verify(staffs).lockByIdAndTenant(staff.id, tenantId);
        order.verify(services).findByIdAndTenantId(offering.id, tenantId);
        order.verify(assignments).existsByTenantIdAndStaffIdAndServiceId(tenantId, staff.id, offering.id);
        verifyNoMoreInteractions(staffs, services, assignments);
    }

    @Test
    void unassignLocksStaffThenValidatesServiceAndDeletesOnlyTenantCompositeKey() {
        stubLockAndService();

        subject.assign(offering.id, staff.id, false);

        var captured = ArgumentCaptor.forClass(StaffService.Key.class);
        var order = inOrder(context, staffs, services, assignments);
        order.verify(context).requireAdmin();
        order.verify(context).tenantId();
        order.verify(staffs).lockByIdAndTenant(staff.id, tenantId);
        order.verify(services).findByIdAndTenantId(offering.id, tenantId);
        order.verify(assignments).deleteById(captured.capture());
        assertEquals(tenantId, captured.getValue().tenantId);
        assertEquals(staff.id, captured.getValue().staffId);
        assertEquals(offering.id, captured.getValue().serviceId);
        verifyNoMoreInteractions(context, staffs, services, assignments);
        verifyNoInteractions(availabilities);
    }

    @Test
    void createAvailabilityLocksBeforeOverlapQueryAndSavesAllCommandFields() {
        stubAvailabilitySave();
        var command = new AvailabilityCommand(DayOfWeek.TUESDAY, LocalTime.NOON, LocalTime.of(13, 0), Model.AvailabilityType.BREAK);

        var saved = subject.saveAvailability(staff.id, command, null);

        assertNotNull(saved.id);
        assertEquals(tenantId, saved.tenantId);
        assertEquals(staff.id, saved.staffId);
        assertEquals(command.dayOfWeek(), saved.dayOfWeek);
        assertEquals(command.startTime(), saved.startTime);
        assertEquals(command.endTime(), saved.endTime);
        assertEquals(command.type(), saved.type);
        var order = inOrder(context, staffs, availabilities);
        order.verify(context).requireAdmin();
        order.verify(context).tenantId();
        order.verify(staffs).lockByIdAndTenant(staff.id, tenantId);
        order.verify(availabilities).findByTenantIdAndStaffId(tenantId, staff.id);
        order.verify(availabilities).save(saved);
        verifyNoMoreInteractions(context, staffs, availabilities);
        verifyNoInteractions(services, assignments);
    }

    @Test
    void updateAvailabilityLocksBeforeFetchingAndExcludesItsOwnIdFromOverlapCheck() {
        stubAvailabilitySave();
        var existing = rule("09:00", "17:00", Model.AvailabilityType.WORKING);
        when(availabilities.findByIdAndTenantId(existing.id, tenantId)).thenReturn(Optional.of(existing));
        when(availabilities.findByTenantIdAndStaffId(tenantId, staff.id)).thenReturn(List.of(existing));

        var saved = subject.saveAvailability(staff.id, command("10:00", "16:00", Model.AvailabilityType.WORKING), existing.id);

        assertSame(existing, saved);
        assertEquals(LocalTime.of(10, 0), saved.startTime);
        assertEquals(LocalTime.of(16, 0), saved.endTime);
        assertEquals(tenantId, saved.tenantId);
        assertEquals(staff.id, saved.staffId);
        var order = inOrder(context, staffs, availabilities);
        order.verify(context).requireAdmin();
        order.verify(context).tenantId();
        order.verify(staffs).lockByIdAndTenant(staff.id, tenantId);
        order.verify(context).tenantId();
        order.verify(availabilities).findByIdAndTenantId(existing.id, tenantId);
        order.verify(availabilities).findByTenantIdAndStaffId(tenantId, staff.id);
        order.verify(availabilities).save(existing);
        verifyNoMoreInteractions(context, staffs, availabilities);
    }

    @ParameterizedTest
    @EnumSource(Model.AvailabilityType.class)
    void overlappingSameDayAndTypeIsRejectedWithoutSaving(Model.AvailabilityType type) {
        stubAvailabilitySave();
        var existing = rule("10:00", "12:00", type);
        when(availabilities.findByTenantIdAndStaffId(tenantId, staff.id)).thenReturn(List.of(existing));

        for (var proposed : List.of(command("09:00", "11:00", type), command("11:00", "13:00", type),
                command("10:30", "11:30", type), command("09:00", "13:00", type), command("10:00", "12:00", type))) {
            assertThrows(IllegalStateException.class, () -> subject.saveAvailability(staff.id, proposed, null));
        }
        verify(availabilities, never()).save(any());
        assertEquals(LocalTime.of(10, 0), existing.startTime);
        assertEquals(LocalTime.NOON, existing.endTime);
    }

    @Test
    void updateOverlappingAnotherRuleIsRejectedWithoutMutatingTheOriginal() {
        stubAvailabilitySave();
        var existing = rule("09:00", "10:00", Model.AvailabilityType.WORKING);
        var other = rule("11:00", "12:00", Model.AvailabilityType.WORKING);
        when(availabilities.findByIdAndTenantId(existing.id, tenantId)).thenReturn(Optional.of(existing));
        when(availabilities.findByTenantIdAndStaffId(tenantId, staff.id)).thenReturn(List.of(existing, other));

        assertThrows(IllegalStateException.class,
                () -> subject.saveAvailability(staff.id, command("09:00", "11:30", Model.AvailabilityType.WORKING), existing.id));

        assertEquals(LocalTime.of(9, 0), existing.startTime);
        assertEquals(LocalTime.of(10, 0), existing.endTime);
        var order = inOrder(staffs, availabilities);
        order.verify(staffs).lockByIdAndTenant(staff.id, tenantId);
        order.verify(availabilities).findByIdAndTenantId(existing.id, tenantId);
        order.verify(availabilities).findByTenantIdAndStaffId(tenantId, staff.id);
        verifyNoMoreInteractions(staffs, availabilities);
    }

    @Test
    void adjacentWindowsAndOverlapsOnDifferentDaysOrTypesAreAllowed() {
        stubAvailabilitySave();
        var existing = rule("10:00", "12:00", Model.AvailabilityType.WORKING);
        var differentDay = rule("09:00", "17:00", Model.AvailabilityType.WORKING);
        differentDay.dayOfWeek = DayOfWeek.TUESDAY;
        var differentType = rule("09:00", "17:00", Model.AvailabilityType.OFF);
        when(availabilities.findByTenantIdAndStaffId(tenantId, staff.id)).thenReturn(List.of(existing, differentDay, differentType));

        assertNotNull(subject.saveAvailability(staff.id, command("09:00", "10:00", Model.AvailabilityType.WORKING), null));
        assertNotNull(subject.saveAvailability(staff.id, command("12:00", "13:00", Model.AvailabilityType.WORKING), null));
        assertNotNull(subject.saveAvailability(staff.id, command("10:30", "11:30", Model.AvailabilityType.BREAK), null));
        verify(availabilities, times(3)).save(any(StaffAvailability.class));
    }

    @ParameterizedTest
    @ValueSource(strings = {"09:00", "08:59"})
    void equalOrReversedAvailabilityTimesAreRejectedBeforeLocking(String end) {
        assertThrows(IllegalArgumentException.class,
                () -> subject.saveAvailability(staff.id, command("09:00", end, Model.AvailabilityType.WORKING), null));
        verify(context).requireAdmin();
        verify(context, never()).tenantId();
        verifyNoInteractions(staffs, services, assignments, availabilities);
    }

    @Test
    void anotherStaffsRuleInSameTenantCannotBeMovedOrEdited() {
        stubLock();
        var foreignRule = rule("09:00", "17:00", Model.AvailabilityType.WORKING);
        var ownerId = UUID.randomUUID();
        foreignRule.staffId = ownerId;
        when(availabilities.findByIdAndTenantId(foreignRule.id, tenantId)).thenReturn(Optional.of(foreignRule));

        assertThrows(NoSuchElementException.class,
                () -> subject.saveAvailability(staff.id, command("10:00", "11:00", Model.AvailabilityType.BREAK), foreignRule.id));

        assertEquals(ownerId, foreignRule.staffId);
        assertEquals(tenantId, foreignRule.tenantId);
        assertEquals(LocalTime.of(9, 0), foreignRule.startTime);
        assertEquals(Model.AvailabilityType.WORKING, foreignRule.type);
        var order = inOrder(staffs, availabilities);
        order.verify(staffs).lockByIdAndTenant(staff.id, tenantId);
        order.verify(availabilities).findByIdAndTenantId(foreignRule.id, tenantId);
        verifyNoMoreInteractions(staffs, availabilities);
    }

    @Test
    void deleteAvailabilityReadsScalarOwnerThenLocksThenFetchesAndDeletesEntity() {
        stubLock();
        var existing = rule("09:00", "17:00", Model.AvailabilityType.WORKING);
        when(availabilities.findStaffIdByIdAndTenantId(existing.id, tenantId)).thenReturn(Optional.of(staff.id));
        when(availabilities.findByIdAndTenantId(existing.id, tenantId)).thenReturn(Optional.of(existing));

        subject.deleteAvailability(existing.id);

        var order = inOrder(context, staffs, availabilities);
        order.verify(context).requireAdmin();
        order.verify(context).tenantId();
        order.verify(availabilities).findStaffIdByIdAndTenantId(existing.id, tenantId);
        order.verify(staffs).lockByIdAndTenant(staff.id, tenantId);
        order.verify(availabilities).findByIdAndTenantId(existing.id, tenantId);
        order.verify(availabilities).delete(existing);
        verifyNoMoreInteractions(context, staffs, availabilities);
        verifyNoInteractions(services, assignments);
    }

    @Test
    void availabilityDisappearingBeforePostLockFetchIsNotDeleted() {
        stubLock();
        var id = UUID.randomUUID();
        when(availabilities.findStaffIdByIdAndTenantId(id, tenantId)).thenReturn(Optional.of(staff.id));
        when(availabilities.findByIdAndTenantId(id, tenantId)).thenReturn(Optional.empty());
        assertThrows(NoSuchElementException.class, () -> subject.deleteAvailability(id));
        var order = inOrder(staffs, availabilities);
        order.verify(availabilities).findStaffIdByIdAndTenantId(id, tenantId);
        order.verify(staffs).lockByIdAndTenant(staff.id, tenantId);
        order.verify(availabilities).findByIdAndTenantId(id, tenantId);
        verifyNoMoreInteractions(staffs, availabilities);
    }

    @Test
    void failedOwnerLockPreventsManagedAvailabilityFetchAndDelete() {
        var id = UUID.randomUUID();
        when(availabilities.findStaffIdByIdAndTenantId(id, tenantId)).thenReturn(Optional.of(staff.id));
        when(staffs.lockByIdAndTenant(staff.id, tenantId)).thenReturn(Optional.empty());
        assertThrows(NoSuchElementException.class, () -> subject.deleteAvailability(id));
        verify(availabilities).findStaffIdByIdAndTenantId(id, tenantId);
        verifyNoMoreInteractions(availabilities);
    }

    @ParameterizedTest
    @ValueSource(strings = {"create", "update", "assign", "unassign", "createAvailability", "updateAvailability", "deleteAvailability"})
    void allWritesRequireAdminBeforeRepositoryAccess(String operation) {
        doThrow(new TenantContext.Forbidden("Tenant admin role required")).when(context).requireAdmin();
        assertThrows(TenantContext.Forbidden.class, () -> write(operation));
        verify(context).requireAdmin();
        verify(context, never()).tenantId();
        verifyNoInteractions(staffs, services, assignments, availabilities);
    }

    @Test
    void foreignStaffFindAndAvailabilityAreDeniedWithoutUnscopedFallback() {
        when(staffs.findByIdAndTenantId(staff.id, tenantId)).thenReturn(Optional.empty());
        assertThrows(NoSuchElementException.class, () -> subject.find(staff.id));
        assertThrows(NoSuchElementException.class, () -> subject.availability(staff.id));
        verify(staffs, times(2)).findByIdAndTenantId(staff.id, tenantId);
        verifyNoMoreInteractions(staffs);
        verifyNoInteractions(availabilities, services, assignments);
        verifyReadOnlyAccess();
    }

    @ParameterizedTest
    @ValueSource(strings = {"update", "assign", "unassign", "createAvailability", "updateAvailability"})
    void foreignStaffWritesStopAtTenantScopedLock(String operation) {
        when(staffs.lockByIdAndTenant(staff.id, tenantId)).thenReturn(Optional.empty());
        assertThrows(NoSuchElementException.class, () -> write(operation));
        verify(staffs).lockByIdAndTenant(staff.id, tenantId);
        verifyNoMoreInteractions(staffs);
        verifyNoInteractions(services, assignments, availabilities);
        assertEquals("Original", staff.name);
    }

    @Test
    void foreignServiceAssignmentReadStopsBeforeStaffAndAssignmentReads() {
        when(services.findByIdAndTenantId(offering.id, tenantId)).thenReturn(Optional.empty());
        assertThrows(NoSuchElementException.class, () -> subject.assignedTo(offering.id));
        verify(services).findByIdAndTenantId(offering.id, tenantId);
        verifyNoMoreInteractions(services);
        verifyNoInteractions(staffs, assignments, availabilities);
        verifyReadOnlyAccess();
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void foreignServiceCannotBeAssignedOrUnassigned(boolean add) {
        stubLock();
        when(services.findByIdAndTenantId(offering.id, tenantId)).thenReturn(Optional.empty());
        assertThrows(NoSuchElementException.class, () -> subject.assign(offering.id, staff.id, add));
        var order = inOrder(staffs, services);
        order.verify(staffs).lockByIdAndTenant(staff.id, tenantId);
        order.verify(services).findByIdAndTenantId(offering.id, tenantId);
        verifyNoMoreInteractions(staffs, services);
        verifyNoInteractions(assignments, availabilities);
    }

    @Test
    void foreignAvailabilityLookupAndDeleteDoNotFetchOrLockItsOwner() {
        var id = UUID.randomUUID();
        when(availabilities.findByIdAndTenantId(id, tenantId)).thenReturn(Optional.empty());
        when(availabilities.findStaffIdByIdAndTenantId(id, tenantId)).thenReturn(Optional.empty());
        assertThrows(NoSuchElementException.class, () -> subject.availabilityById(id));
        assertThrows(NoSuchElementException.class, () -> subject.deleteAvailability(id));
        verify(availabilities).findByIdAndTenantId(id, tenantId);
        verify(availabilities).findStaffIdByIdAndTenantId(id, tenantId);
        verifyNoMoreInteractions(availabilities);
        verifyNoInteractions(staffs, services, assignments);
    }

    @Test
    void foreignAvailabilityCannotBeUpdatedEvenWithAnOwnedStaffId() {
        stubLock();
        var id = UUID.randomUUID();
        when(availabilities.findByIdAndTenantId(id, tenantId)).thenReturn(Optional.empty());
        assertThrows(NoSuchElementException.class,
                () -> subject.saveAvailability(staff.id, command("09:00", "10:00", Model.AvailabilityType.WORKING), id));
        verify(availabilities).findByIdAndTenantId(id, tenantId);
        verifyNoMoreInteractions(availabilities);
    }

    @Test
    void allEffectiveWriteTransactionsUseReadCommitted() throws Exception {
        var source = new AnnotationTransactionAttributeSource();
        for (var method : List.of(StaffFeatureService.class.getMethod("save", StaffCommand.class, UUID.class),
                StaffFeatureService.class.getMethod("assign", UUID.class, UUID.class, boolean.class),
                StaffFeatureService.class.getMethod("saveAvailability", UUID.class, AvailabilityCommand.class, UUID.class),
                StaffFeatureService.class.getMethod("deleteAvailability", UUID.class))) {
            var transaction = source.getTransactionAttribute(method, StaffFeatureService.class);
            assertNotNull(transaction, method.toString());
            assertEquals(TransactionDefinition.ISOLATION_READ_COMMITTED, transaction.getIsolationLevel(), method.toString());
            assertFalse(transaction.isReadOnly(), method.toString());
        }
    }

    private void verifyReadOnlyAccess() {
        verify(context, never()).requireAdmin();
        verify(staffs, never()).lockByIdAndTenant(any(), any());
    }

    private void stubLock() {
        when(staffs.lockByIdAndTenant(staff.id, tenantId)).thenReturn(Optional.of(staff));
    }

    private void stubLockAndService() {
        stubLock();
        when(services.findByIdAndTenantId(offering.id, tenantId)).thenReturn(Optional.of(offering));
    }

    private void stubAvailabilitySave() {
        stubLock();
        when(availabilities.findByTenantIdAndStaffId(tenantId, staff.id)).thenReturn(List.of());
        when(availabilities.save(any(StaffAvailability.class))).thenAnswer(invocation -> invocation.getArgument(0));
    }

    private StaffService assignment(UUID staffId) {
        var assignment = new StaffService();
        assignment.tenantId = tenantId;
        assignment.staffId = staffId;
        assignment.serviceId = offering.id;
        return assignment;
    }

    private AvailabilityCommand command(String start, String end, Model.AvailabilityType type) {
        return new AvailabilityCommand(DayOfWeek.MONDAY, LocalTime.parse(start), LocalTime.parse(end), type);
    }

    private StaffAvailability rule(String start, String end, Model.AvailabilityType type) {
        var rule = new StaffAvailability();
        rule.tenantId = tenantId;
        rule.staffId = staff.id;
        rule.dayOfWeek = DayOfWeek.MONDAY;
        rule.startTime = LocalTime.parse(start);
        rule.endTime = LocalTime.parse(end);
        rule.type = type;
        return rule;
    }

    private void write(String operation) {
        var command = command("09:00", "10:00", Model.AvailabilityType.WORKING);
        switch (operation) {
            case "create" -> subject.save(new StaffCommand("New", null), null);
            case "update" -> subject.save(new StaffCommand("Updated", Model.Status.INACTIVE), staff.id);
            case "assign" -> subject.assign(offering.id, staff.id, true);
            case "unassign" -> subject.assign(offering.id, staff.id, false);
            case "createAvailability" -> subject.saveAvailability(staff.id, command, null);
            case "updateAvailability" -> subject.saveAvailability(staff.id, command, UUID.randomUUID());
            case "deleteAvailability" -> subject.deleteAvailability(UUID.randomUUID());
            default -> throw new AssertionError("Unknown test operation: " + operation);
        }
    }
}