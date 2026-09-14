package com.runloyal.booking.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.runloyal.booking.common.exception.ConflictException;
import com.runloyal.booking.domain.*;
import com.runloyal.booking.repo.*;
import com.runloyal.booking.security.TenantContext;
import com.runloyal.booking.web.dto.request.BookingCommand;
import com.runloyal.booking.web.dto.request.ServiceCommand;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import java.util.stream.Stream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;

class BookingFeatureServiceTest {
    private final UUID tenantId = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private final TenantContext context = mock(TenantContext.class);
    private final TenantRepository tenants = mock(TenantRepository.class);
    private final ServiceRepository services = mock(ServiceRepository.class);
    private final StaffRepository staffs = mock(StaffRepository.class);
    private final AssignmentRepository assignments = mock(AssignmentRepository.class);
    private final AvailabilityRepository availabilities = mock(AvailabilityRepository.class);
    private final BookingRepository bookings = mock(BookingRepository.class);
    private final UnavailabilityRepository unavailable = mock(UnavailabilityRepository.class);
    private final BookingFeatureService subject = new BookingFeatureService(
            context, tenants, services, staffs, assignments, availabilities, bookings, unavailable);
    private final Staff staff = staff("Alex");
    private final ServiceOffering offering = new ServiceOffering();
    private final Instant monday = Instant.parse("2026-01-05T10:00:00Z");

    @BeforeEach
    void setUp() {
        offering.tenantId = tenantId;
        offering.status = Model.Status.ACTIVE;
        offering.durationMinutes = 30;
        offering.name = "Grooming";
        offering.category = "Care";
        offering.price = BigDecimal.TEN;
        when(context.tenantId()).thenReturn(tenantId);
    }

    @AfterEach
    void neverUsesUnscopedEntityReads() {
        // TenantRepository.findById is deliberately allowed: its key IS the authenticated tenant.
        for (var repository : List.of(services, staffs, assignments, availabilities, bookings)) {
            for (var invocation : mockingDetails(repository).getInvocations()) {
                assertFalse(Set.of("findById", "findAll", "findAllById", "getById", "getOne", "getReferenceById")
                        .contains(invocation.getMethod().getName()), invocation::toString);
            }
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"2026-01-05T03:30:01Z", "2026-01-05T03:30:00.000000001Z"})
    void tenantHalfHourGridCeilsSecondsAndNanoseconds(String input) {
        var from = Instant.parse(input); // 09:00 plus a fraction in Asia/Kolkata.
        var to = Instant.parse("2026-01-05T05:00:00Z");
        stubRead("Asia/Kolkata", from, to, List.of(staff),
                List.of(work(staff, DayOfWeek.MONDAY, "09:00", "12:00")), List.of());

        var result = subject.availableSlots(offering.id, from, to);

        assertEquals(List.of(Instant.parse("2026-01-05T04:00:00Z"), Instant.parse("2026-01-05T04:30:00Z")), starts(result));
        assertEquals(to, result.get(1).endAt());
        assertTrue(result.stream().allMatch(slot -> slot.availableStaff().equals(List.of(staff))));
        verifyBatchRead(from, to, List.of(staff));
    }

    @Test
    void gridIsTenantLocalRatherThanUtcAndExactFromIsIncluded() {
        // Kathmandu half-hour boundaries land at :15/:45 UTC, not :00/:30.
        var from = Instant.parse("2026-01-05T03:15:00Z");
        var to = from.plusSeconds(3600);
        stubRead("Asia/Kathmandu", from, to, List.of(staff),
                List.of(work(staff, DayOfWeek.MONDAY, "09:00", "12:00")), List.of());

        var result = subject.availableSlots(offering.id, from, to);

        assertEquals(List.of(from, from.plusSeconds(1800)), starts(result));
        verifyBatchRead(from, to, List.of(staff));
    }

    @Test
    void fallSlotsContainBothOccurrencesInInstantOrderWithoutDuplicates() {
        var from = Instant.parse("2026-11-01T04:30:00Z");
        var to = Instant.parse("2026-11-01T08:00:00Z");
        stubRead("America/New_York", from, to, List.of(staff),
                List.of(work(staff, DayOfWeek.SUNDAY, "00:00", "04:00")), List.of());

        var result = subject.availableSlots(offering.id, from, to);

        assertEquals(Stream.iterate(from, start -> start.plusSeconds(1800)).limit(7).toList(), starts(result));
        var zone = ZoneId.of("America/New_York");
        assertEquals(2, result.stream().filter(slot -> slot.startAt().atZone(zone).toLocalTime().equals(LocalTime.of(1, 0))).count());
        assertEquals(2, result.stream().filter(slot -> slot.startAt().atZone(zone).toLocalTime().equals(LocalTime.of(1, 30))).count());
        assertEquals(result.size(), new HashSet<>(starts(result)).size());
        verifyBatchRead(from, to, List.of(staff));
    }

    @Test
    void springSlotsSkipNonexistentLocalTimesWithoutShiftingThemIntoDuplicates() {
        var from = Instant.parse("2026-03-08T06:00:00Z");
        var to = Instant.parse("2026-03-08T08:00:00Z");
        stubRead("America/New_York", from, to, List.of(staff),
                List.of(work(staff, DayOfWeek.SUNDAY, "00:00", "05:00")), List.of());

        var result = subject.availableSlots(offering.id, from, to);

        assertEquals(Stream.iterate(from, start -> start.plusSeconds(1800)).limit(4).toList(), starts(result));
        assertEquals(List.of(LocalTime.of(1, 0), LocalTime.of(1, 30), LocalTime.of(3, 0), LocalTime.of(3, 30)),
                result.stream().map(slot -> slot.startAt().atZone(ZoneId.of("America/New_York")).toLocalTime()).toList());
        assertEquals(result.size(), new HashSet<>(starts(result)).size());
        verifyBatchRead(from, to, List.of(staff));
    }

    @Test
    void slotsCrossingFallLocalReversalStillRespectRepeatedBreak() {
        var from = Instant.parse("2026-11-01T05:00:00Z");
        var to = Instant.parse("2026-11-01T07:30:00Z");
        var pause = work(staff, DayOfWeek.SUNDAY, "01:30", "01:45");
        pause.type = Model.AvailabilityType.BREAK;
        stubRead("America/New_York", from, to, List.of(staff),
                List.of(work(staff, DayOfWeek.SUNDAY, "00:00", "04:00"), pause), List.of());

        assertEquals(List.of(from, Instant.parse("2026-11-01T07:00:00Z")), starts(subject.availableSlots(offering.id, from, to)));
        verifyBatchRead(from, to, List.of(staff));
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void availableEndpointsBatchOnceAcrossAllStaffAndSlotsWithoutReadLocks(boolean slots) {
        var second = staff("Blair");
        var inactive = staff("Inactive");
        inactive.status = Model.Status.INACTIVE;
        var unassigned = staff("Unassigned");
        var to = monday.plusSeconds(slots ? 7200 : 1800);
        var conflict = booking(staff, monday, monday.plusSeconds(1800), Model.BookingStatus.CONFIRMED);
        // Deliberately exceed the repository's CONFIRMED-only contract to exercise the
        // engine's defensive status filtering, independently of integration query tests.
        var cancelled = booking(second, monday, to, Model.BookingStatus.CANCELLED);
        stubRead("UTC", monday, to, List.of(staff, second, inactive),
                List.of(work(staff, DayOfWeek.MONDAY, "09:00", "17:00"), work(second, DayOfWeek.MONDAY, "09:00", "17:00")),
                List.of(conflict, cancelled));
        when(staffs.findByTenantId(tenantId)).thenReturn(List.of(staff, second, inactive, unassigned));

        if (slots) {
            var result = subject.availableSlots(offering.id, monday, to);
            assertEquals(4, result.size());
            assertEquals(List.of(second), result.get(0).availableStaff());
            for (var slot : result.subList(1, result.size())) {
                assertEquals(List.of(staff, second), slot.availableStaff());
            }
        } else {
            assertEquals(List.of(second), subject.available(offering.id, monday));
        }
        verifyBatchRead(monday, to, List.of(staff, second));
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void batchEvaluationRejectsForeignWorkingRulesAndIgnoresForeignBlockers(boolean slots) {
        var second = staff("Blair");
        var third = staff("Casey");
        var to = monday.plusSeconds(1800);
        var validWork = work(staff, DayOfWeek.MONDAY, "09:00", "17:00");
        var foreignWork = work(second, DayOfWeek.MONDAY, "09:00", "17:00");
        foreignWork.tenantId = UUID.randomUUID();
        var foreignBreak = work(staff, DayOfWeek.MONDAY, "09:00", "17:00");
        foreignBreak.type = Model.AvailabilityType.BREAK;
        foreignBreak.tenantId = UUID.randomUUID();
        var foreignBooking = booking(staff, monday, to, Model.BookingStatus.CONFIRMED);
        foreignBooking.tenantId = UUID.randomUUID();
        var otherStaffBooking = booking(third, monday, to, Model.BookingStatus.CONFIRMED);
        // Intentionally inject foreign rows to verify defense in depth after batch loading.
        stubRead("UTC", monday, to, List.of(staff, second, third),
                List.of(validWork, foreignWork, foreignBreak, work(third, DayOfWeek.MONDAY, "09:00", "17:00")),
                List.of(foreignBooking, otherStaffBooking));

        if (slots) {
            var result = subject.availableSlots(offering.id, monday, to);
            assertEquals(1, result.size());
            assertEquals(List.of(staff), result.get(0).availableStaff());
        } else {
            assertEquals(List.of(staff), subject.available(offering.id, monday));
        }
        verifyBatchRead(monday, to, List.of(staff, second, third));
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void inactiveOfferingHasNoAvailableStaffOrSlots(boolean slots) {
        offering.status = Model.Status.INACTIVE;
        var to = monday.plusSeconds(1800);
        stubRead("UTC", monday, to, List.of(staff), List.of(work(staff, DayOfWeek.MONDAY, "09:00", "17:00")), List.of());
        assertTrue(slots ? subject.availableSlots(offering.id, monday, to).isEmpty() : subject.available(offering.id, monday).isEmpty());
        verifyBatchRead(monday, to, List.of(staff));
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void noAssignedActiveStaffSkipsRuleAndBookingBatchQueries(boolean slots) {
        var to = monday.plusSeconds(1800);
        staff.status = Model.Status.INACTIVE;
        stubRead("UTC", monday, to, List.of(staff), List.of(), List.of());

        assertTrue(slots ? subject.availableSlots(offering.id, monday, to).isEmpty() : subject.available(offering.id, monday).isEmpty());

        verifyNoInteractions(availabilities, bookings);
        verify(staffs).findByTenantId(tenantId);
        verifyNoMoreInteractions(staffs);
        verify(assignments).findByTenantIdAndServiceId(tenantId, offering.id);
        verifyNoMoreInteractions(assignments);
        verify(context, never()).requireAdmin();
    }

    @Test
    void durationMustFitEntirelyInRequestedSlotRange() {
        var to = monday.plusSeconds(1799);
        stubRead("UTC", monday, to, List.of(staff), List.of(work(staff, DayOfWeek.MONDAY, "09:00", "17:00")), List.of());
        assertTrue(subject.availableSlots(offering.id, monday, to).isEmpty());
        verifyBatchRead(monday, to, List.of(staff));
    }

    static Stream<Arguments> invalidRanges() {
        var from = Instant.parse("2026-01-05T00:00:00Z");
        return Stream.of(Arguments.of(null, from), Arguments.of(from, null), Arguments.of(null, null),
                Arguments.of(from, from), Arguments.of(from, from.minusNanos(1)),
                Arguments.of(from, from.plus(Duration.ofDays(31)).plusNanos(1)));
    }

    @ParameterizedTest
    @MethodSource("invalidRanges")
    void calendarAndSlotsRejectInvalidRangesBeforeAnyLookup(Instant from, Instant to) {
        assertThrows(IllegalArgumentException.class, () -> subject.calendar(from, to));
        assertThrows(IllegalArgumentException.class, () -> subject.availableSlots(offering.id, from, to));
        verifyNoInteractions(context, services, staffs, assignments, availabilities, bookings, tenants);
    }

    @Test
    void calendarAndSlotsAcceptExactly31ElapsedDays() {
        var to = monday.plus(Duration.ofDays(31));
        stubRead("UTC", monday, to, List.of(), List.of(), List.of());
        var historical = booking(staff, monday.minusSeconds(1800), monday.plusSeconds(1800), Model.BookingStatus.CANCELLED);
        when(bookings.calendar(tenantId, monday, to)).thenReturn(List.of(historical));

        assertTrue(subject.availableSlots(offering.id, monday, to).isEmpty());
        assertEquals(List.of(historical), subject.calendar(monday, to));

        verify(bookings).calendar(tenantId, monday, to);
        verifyNoMoreInteractions(bookings);
        verifyNoInteractions(availabilities);
        verify(staffs, never()).lockByIdAndTenant(any(), any());
        verify(context, never()).requireAdmin();
    }

    @Test
    void findBookingIsTenantScopedAndDoesNotLockOrRequireAdmin() {
        var booking = booking(staff, monday, monday.plusSeconds(1800), Model.BookingStatus.CONFIRMED);
        when(bookings.findByIdAndTenantId(booking.id, tenantId)).thenReturn(Optional.of(booking));

        assertSame(booking, subject.findBooking(booking.id));

        verify(bookings).findByIdAndTenantId(booking.id, tenantId);
        verifyNoMoreInteractions(bookings);
        verifyNoInteractions(staffs, services, assignments, availabilities, tenants);
        verify(context, never()).requireAdmin();
    }

    @Test
    void bookChecksMembershipThenLocksStaffBeforeEveryEligibilityQueryAndSave() {
        stubBook();

        var result = subject.book(command(monday, null));

        assertEquals(tenantId, result.tenantId);
        assertEquals(staff.id, result.staffId);
        assertEquals(offering.id, result.serviceId);
        assertEquals(monday, result.startAt);
        assertEquals(monday.plusSeconds(1800), result.endAt);
        assertEquals(Model.BookingStatus.CONFIRMED, result.status);
        assertEquals("Customer", result.customerName);
        assertEquals("", result.petName);
        var order = inOrder(context, staffs, services, bookings, availabilities, assignments, tenants);
        order.verify(context).requireAdmin();
        order.verify(context).tenantId();
        order.verify(staffs).lockByIdAndTenant(staff.id, tenantId);
        order.verify(services).findByIdAndTenantId(offering.id, tenantId);
        order.verify(bookings).conflicts(tenantId, staff.id, monday, monday.plusSeconds(1800));
        order.verify(availabilities).findByTenantIdAndStaffId(tenantId, staff.id);
        order.verify(assignments).existsByTenantIdAndStaffIdAndServiceId(tenantId, staff.id, offering.id);
        order.verify(tenants).findById(tenantId);
        order.verify(bookings).save(result);
        verifyNoMoreInteractions(context, staffs, services, bookings, availabilities, assignments, tenants);
    }

    @Test
    void catalogDurationChangesOnlyFutureCreationsNotHistoricalIntervalsOrConflicts() {
        stubBook();
        var historical = subject.book(command(monday, "Pip"));
        var historicalEnd = historical.endAt;
        when(services.save(any(ServiceOffering.class))).thenAnswer(invocation -> invocation.getArgument(0));
        new ServiceCatalogService(context, services).save(
                new ServiceCommand("Updated", "Description", "Care", 60, BigDecimal.TEN, Model.Status.ACTIVE), offering.id);
        var later = monday.plusSeconds(7200);

        var created = subject.book(command(later, "Pip"));

        assertEquals(30, Duration.between(historical.startAt, historical.endAt).toMinutes());
        assertEquals(historicalEnd, historical.endAt);
        assertEquals(60, Duration.between(created.startAt, created.endAt).toMinutes());
        assertEquals("Pip", created.petName);
        verify(bookings).conflicts(tenantId, staff.id, later, later.plusSeconds(3600));
        when(bookings.findByIdAndTenantId(historical.id, tenantId)).thenReturn(Optional.of(historical));
        assertEquals(historicalEnd, subject.findBooking(historical.id).endAt);
        when(bookings.calendar(tenantId, monday, later.plusSeconds(3600))).thenReturn(List.of(historical, created));
        assertEquals(List.of(historical, created), subject.calendar(monday, later.plusSeconds(3600)));
        assertEquals(historicalEnd, historical.endAt);
        // The original half-hour remains occupied only until its stored end, despite the new duration.
        when(bookings.conflicts(tenantId, staff.id, historicalEnd, historicalEnd.plusSeconds(3600)))
                .thenReturn(List.of(historical));
        assertEquals(historicalEnd, subject.book(command(historicalEnd, "Next pet")).startAt);
    }

    @Test
    void overlappingConfirmedBookingConflictsAndNeverSaves() {
        stubBook();
        when(bookings.conflicts(tenantId, staff.id, monday, monday.plusSeconds(1800)))
                .thenReturn(List.of(booking(staff, monday.minusSeconds(60), monday.plusSeconds(60), Model.BookingStatus.CONFIRMED)));
        assertThrows(ConflictException.class, () -> subject.book(command(monday, "Pip")));
        verify(bookings, never()).save(any());
    }

    @Test
    void cancelledBookingDoesNotPreventCreation() {
        stubBook();
        // A defensive engine regression: the real conflicts query already excludes CANCELLED.
        when(bookings.conflicts(tenantId, staff.id, monday, monday.plusSeconds(1800)))
                .thenReturn(List.of(booking(staff, monday, monday.plusSeconds(1800), Model.BookingStatus.CANCELLED)));
        assertEquals(Model.BookingStatus.CONFIRMED, subject.book(command(monday, "Pip")).status);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void inactiveStaffOrServiceCannotBeBooked(boolean inactiveStaff) {
        stubBook();
        if (inactiveStaff) staff.status = Model.Status.INACTIVE;
        else offering.status = Model.Status.INACTIVE;
        assertThrows(ConflictException.class, () -> subject.book(command(monday, "Pip")));
        verify(bookings, never()).save(any());
    }

    @Test
    void unassignedStaffCannotBeBooked() {
        stubBook();
        when(assignments.existsByTenantIdAndStaffIdAndServiceId(tenantId, staff.id, offering.id)).thenReturn(false);
        assertThrows(ConflictException.class, () -> subject.book(command(monday, "Pip")));
        verify(bookings, never()).save(any());
    }

    @Test
    void cancellationReadsScalarOwnerThenLocksThenFetchesCurrentBooking() {
        var booking = booking(staff, monday, monday.plusSeconds(1800), Model.BookingStatus.CONFIRMED);
        stubCancel(booking);

        assertSame(booking, subject.cancel(booking.id));

        assertEquals(Model.BookingStatus.CANCELLED, booking.status);
        assertEquals(monday, booking.startAt);
        assertEquals(monday.plusSeconds(1800), booking.endAt);
        var order = inOrder(context, bookings, staffs);
        order.verify(context).requireAdmin();
        order.verify(context).tenantId();
        order.verify(bookings).findStaffIdByIdAndTenantId(booking.id, tenantId);
        order.verify(staffs).lockByIdAndTenant(staff.id, tenantId);
        order.verify(bookings).findByIdAndTenantId(booking.id, tenantId);
        verifyNoMoreInteractions(context, bookings, staffs);
        verifyNoInteractions(services, assignments, availabilities, tenants);
    }

    @Test
    void duplicateCancellationStillLocksAndRefetchesBeforeReportingConflict() {
        var booking = booking(staff, monday, monday.plusSeconds(1800), Model.BookingStatus.CONFIRMED);
        stubCancel(booking);
        subject.cancel(booking.id);
        clearInvocations(context, staffs, bookings);

        assertThrows(ConflictException.class, () -> subject.cancel(booking.id));

        var order = inOrder(context, bookings, staffs);
        order.verify(context).requireAdmin();
        order.verify(context).tenantId();
        order.verify(bookings).findStaffIdByIdAndTenantId(booking.id, tenantId);
        order.verify(staffs).lockByIdAndTenant(staff.id, tenantId);
        order.verify(bookings).findByIdAndTenantId(booking.id, tenantId);
        verifyNoMoreInteractions(context, bookings, staffs);
        assertEquals(Model.BookingStatus.CANCELLED, booking.status);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void writeOperationsDenyNonAdminsBeforeRepositoryAccess(boolean cancel) {
        doThrow(new TenantContext.Forbidden("Tenant admin role required")).when(context).requireAdmin();
        assertThrows(TenantContext.Forbidden.class, () -> {
            if (cancel) subject.cancel(UUID.randomUUID());
            else subject.book(command(monday, "Pip"));
        });
        verify(context, never()).tenantId();
        verifyNoInteractions(tenants, services, staffs, assignments, availabilities, bookings);
    }

    @Test
    void foreignBookingFindAndCancelCannotReadOrLockItsOwner() {
        var foreignId = UUID.randomUUID();
        when(bookings.findByIdAndTenantId(foreignId, tenantId)).thenReturn(Optional.empty());
        when(bookings.findStaffIdByIdAndTenantId(foreignId, tenantId)).thenReturn(Optional.empty());
        assertThrows(NoSuchElementException.class, () -> subject.findBooking(foreignId));
        assertThrows(NoSuchElementException.class, () -> subject.cancel(foreignId));
        verify(bookings).findByIdAndTenantId(foreignId, tenantId);
        verify(bookings).findStaffIdByIdAndTenantId(foreignId, tenantId);
        verifyNoMoreInteractions(bookings);
        verifyNoInteractions(staffs, services, assignments, availabilities, tenants);
    }

    @Test
    void foreignStaffBookingDeniedAtTenantScopedLockBeforeServiceLookup() {
        when(staffs.lockByIdAndTenant(staff.id, tenantId)).thenReturn(Optional.empty());
        assertThrows(NoSuchElementException.class, () -> subject.book(command(monday, "Pip")));
        verify(staffs).lockByIdAndTenant(staff.id, tenantId);
        verifyNoMoreInteractions(staffs);
        verifyNoInteractions(services, assignments, availabilities, bookings, tenants);
    }

    @Test
    void foreignServiceCannotBeBookedOrQueriedThroughAvailableEndpoints() {
        when(staffs.lockByIdAndTenant(staff.id, tenantId)).thenReturn(Optional.of(staff));
        when(services.findByIdAndTenantId(offering.id, tenantId)).thenReturn(Optional.empty());
        assertThrows(NoSuchElementException.class, () -> subject.book(command(monday, "Pip")));
        assertThrows(NoSuchElementException.class, () -> subject.available(offering.id, monday));
        assertThrows(NoSuchElementException.class, () -> subject.availableSlots(offering.id, monday, monday.plusSeconds(1800)));
        verify(services, times(3)).findByIdAndTenantId(offering.id, tenantId);
        verifyNoMoreInteractions(services);
        verifyNoInteractions(assignments, availabilities, bookings, tenants);
    }

    @Test
    void cancelDoesNotFetchManagedBookingWhenOwnerLockFails() {
        var id = UUID.randomUUID();
        when(bookings.findStaffIdByIdAndTenantId(id, tenantId)).thenReturn(Optional.of(staff.id));
        when(staffs.lockByIdAndTenant(staff.id, tenantId)).thenReturn(Optional.empty());
        assertThrows(NoSuchElementException.class, () -> subject.cancel(id));
        verify(bookings).findStaffIdByIdAndTenantId(id, tenantId);
        verifyNoMoreInteractions(bookings);
    }

    @Test
    void cancellationHandlesBookingDisappearingBeforePostLockFetch() {
        var id = UUID.randomUUID();
        when(bookings.findStaffIdByIdAndTenantId(id, tenantId)).thenReturn(Optional.of(staff.id));
        when(staffs.lockByIdAndTenant(staff.id, tenantId)).thenReturn(Optional.of(staff));
        when(bookings.findByIdAndTenantId(id, tenantId)).thenReturn(Optional.empty());
        assertThrows(NoSuchElementException.class, () -> subject.cancel(id));
        var order = inOrder(bookings, staffs);
        order.verify(bookings).findStaffIdByIdAndTenantId(id, tenantId);
        order.verify(staffs).lockByIdAndTenant(staff.id, tenantId);
        order.verify(bookings).findByIdAndTenantId(id, tenantId);
        verifyNoMoreInteractions(bookings, staffs);
    }

    @Test
    void effectiveWriteTransactionsUseReadCommittedAndReadsAreReadOnly() throws Exception {
        var source = new AnnotationTransactionAttributeSource();
        for (var method : List.of(BookingFeatureService.class.getMethod("book", BookingCommand.class),
                BookingFeatureService.class.getMethod("cancel", UUID.class))) {
            var transaction = source.getTransactionAttribute(method, BookingFeatureService.class);
            assertNotNull(transaction, method.toString());
            assertEquals(TransactionDefinition.ISOLATION_READ_COMMITTED, transaction.getIsolationLevel(), method.toString());
            assertFalse(transaction.isReadOnly(), method.toString());
        }
        for (var method : List.of(BookingFeatureService.class.getMethod("available", UUID.class, Instant.class),
                BookingFeatureService.class.getMethod("availableSlots", UUID.class, Instant.class, Instant.class),
                BookingFeatureService.class.getMethod("calendar", Instant.class, Instant.class))) {
            var transaction = source.getTransactionAttribute(method, BookingFeatureService.class);
            assertNotNull(transaction, method.toString());
            assertTrue(transaction.isReadOnly(), method.toString());
        }
    }

    private Staff staff(String name) {
        var value = new Staff();
        value.tenantId = tenantId;
        value.name = name;
        value.status = Model.Status.ACTIVE;
        return value;
    }

    private StaffAvailability work(Staff owner, DayOfWeek day, String start, String end) {
        var rule = new StaffAvailability();
        rule.tenantId = tenantId;
        rule.staffId = owner.id;
        rule.dayOfWeek = day;
        rule.type = Model.AvailabilityType.WORKING;
        rule.startTime = LocalTime.parse(start);
        rule.endTime = LocalTime.parse(end);
        return rule;
    }

    private Booking booking(Staff owner, Instant start, Instant end, Model.BookingStatus status) {
        var booking = new Booking();
        booking.tenantId = tenantId;
        booking.staffId = owner.id;
        booking.serviceId = offering.id;
        booking.startAt = start;
        booking.endAt = end;
        booking.status = status;
        return booking;
    }

    private BookingCommand command(Instant start, String pet) {
        return new BookingCommand(offering.id, staff.id, start, "Customer", pet);
    }

    private void stubZone(String zone) {
        var tenant = new Tenant();
        tenant.id = tenantId;
        tenant.timezone = zone;
        when(tenants.findById(tenantId)).thenReturn(Optional.of(tenant));
    }

    private void stubRead(String zone, Instant from, Instant to, List<Staff> assignedStaff,
            List<StaffAvailability> rules, List<Booking> confirmed) {
        stubZone(zone);
        when(services.findByIdAndTenantId(offering.id, tenantId)).thenReturn(Optional.of(offering));
        when(staffs.findByTenantId(tenantId)).thenReturn(assignedStaff);
        when(assignments.findByTenantIdAndServiceId(tenantId, offering.id)).thenReturn(assignedStaff.stream().map(owner -> {
            var assignment = new StaffService();
            assignment.tenantId = tenantId;
            assignment.staffId = owner.id;
            assignment.serviceId = offering.id;
            return assignment;
        }).toList());
        when(availabilities.findByTenantIdAndStaffIdIn(eq(tenantId), anyCollection())).thenReturn(rules);
        when(bookings.confirmedInRange(tenantId, from, to)).thenReturn(confirmed);
    }

    private void verifyBatchRead(Instant from, Instant to, List<Staff> loadedStaff) {
        verify(services).findByIdAndTenantId(offering.id, tenantId);
        verify(assignments).findByTenantIdAndServiceId(tenantId, offering.id);
        verify(staffs).findByTenantId(tenantId);
        verify(availabilities).findByTenantIdAndStaffIdIn(tenantId, loadedStaff.stream().map(owner -> owner.id).toList());
        verify(bookings).confirmedInRange(tenantId, from, to);
        verify(tenants).findById(tenantId);
        verifyNoMoreInteractions(services, assignments, staffs, availabilities, bookings, tenants);
        verify(context, never()).requireAdmin();
    }

    private void stubBook() {
        stubZone("UTC");
        when(staffs.lockByIdAndTenant(staff.id, tenantId)).thenReturn(Optional.of(staff));
        when(services.findByIdAndTenantId(offering.id, tenantId)).thenReturn(Optional.of(offering));
        when(assignments.existsByTenantIdAndStaffIdAndServiceId(tenantId, staff.id, offering.id)).thenReturn(true);
        when(availabilities.findByTenantIdAndStaffId(tenantId, staff.id))
                .thenReturn(List.of(work(staff, DayOfWeek.MONDAY, "09:00", "17:00")));
        when(bookings.conflicts(eq(tenantId), eq(staff.id), any(Instant.class), any(Instant.class))).thenReturn(List.of());
        when(bookings.save(any(Booking.class))).thenAnswer(invocation -> invocation.getArgument(0));
    }

    private void stubCancel(Booking booking) {
        when(bookings.findStaffIdByIdAndTenantId(booking.id, tenantId)).thenReturn(Optional.of(staff.id));
        when(staffs.lockByIdAndTenant(staff.id, tenantId)).thenReturn(Optional.of(staff));
        when(bookings.findByIdAndTenantId(booking.id, tenantId)).thenReturn(Optional.of(booking));
    }

    private List<Instant> starts(List<BookingFeatureService.AvailableSlot> slots) {
        return slots.stream().map(BookingFeatureService.AvailableSlot::startAt).toList();
    }
}
