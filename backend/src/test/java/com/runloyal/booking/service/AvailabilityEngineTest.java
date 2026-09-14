package com.runloyal.booking.service;

import static org.junit.jupiter.api.Assertions.*;

import com.runloyal.booking.domain.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;

class AvailabilityEngineTest {
  final AvailabilityEngine engine = new AvailabilityEngine();
  final ZoneId zone = ZoneId.of("Asia/Kolkata");
  final ZoneId newYork = ZoneId.of("America/New_York");
  final UUID tenantId = UUID.fromString("00000000-0000-0000-0000-000000000001");
  final UUID staffId = UUID.fromString("00000000-0000-0000-0000-000000000002");

  Staff staff() {
    var s = new Staff();
    s.id = staffId;
    s.tenantId = tenantId;
    s.status = Model.Status.ACTIVE;
    return s;
  }

  ServiceOffering service() {
    var s = new ServiceOffering();
    s.tenantId = tenantId;
    s.status = Model.Status.ACTIVE;
    s.durationMinutes = 60;
    return s;
  }

  StaffAvailability rule(Model.AvailabilityType t, LocalTime a, LocalTime b) {
    var r = new StaffAvailability();
    r.tenantId = tenantId;
    r.staffId = staffId;
    r.dayOfWeek = DayOfWeek.MONDAY;
    r.type = t;
    r.startTime = a;
    r.endTime = b;
    return r;
  }

  Instant at(int hour, int min) {
    return ZonedDateTime.of(2026, 1, 5, hour, min, 0, 0, zone).toInstant();
  }

  @Test
  void acceptsWorkingSlotAndTouchingBooking() {
    var b = new Booking();
    b.tenantId = tenantId;
    b.staffId = staffId;
    b.status = Model.BookingStatus.CONFIRMED;
    b.startAt = at(9, 0);
    b.endAt = at(10, 0);
    assertTrue(
        engine.eligible(
            staff(),
            service(),
            true,
            List.of(rule(Model.AvailabilityType.WORKING, LocalTime.of(9, 0), LocalTime.of(17, 0))),
            List.of(b),
            at(10, 0),
            zone));
  }

  @Test
  void rejectsBreakAndHoursAndInactive() {
    var rules = List.of(
        rule(Model.AvailabilityType.WORKING, LocalTime.of(9, 0), LocalTime.of(17, 0)),
        rule(Model.AvailabilityType.BREAK, LocalTime.of(12, 0), LocalTime.of(13, 0)));
    assertFalse(engine.eligible(staff(), service(), true, rules, List.of(), at(12, 0), zone));
    assertFalse(engine.eligible(staff(), service(), true, rules, List.of(), at(16, 30), zone));
    var x = staff();
    x.status = Model.Status.INACTIVE;
    assertFalse(engine.eligible(x, service(), true, rules, List.of(), at(10, 0), zone));
  }

  @Test
  void rejectsOverlapAndUnassigned() {
    var b = new Booking();
    b.tenantId = tenantId;
    b.staffId = staffId;
    b.status = Model.BookingStatus.CONFIRMED;
    b.startAt = at(10, 30);
    b.endAt = at(11, 30);
    var r = List.of(rule(Model.AvailabilityType.WORKING, LocalTime.of(9, 0), LocalTime.of(17, 0)));
    assertFalse(engine.eligible(staff(), service(), true, r, List.of(b), at(10, 0), zone));
    assertFalse(engine.eligible(staff(), service(), false, r, List.of(), at(10, 0), zone));
  }

  @Test
  void cancelledBookingDoesNotBlockAvailability() {
    var booking = new Booking();
    booking.tenantId = tenantId;
    booking.staffId = staffId;
    booking.status = Model.BookingStatus.CANCELLED;
    booking.startAt = at(10, 0);
    booking.endAt = at(11, 0);
    var rules = List.of(rule(Model.AvailabilityType.WORKING, LocalTime.of(9, 0), LocalTime.of(17, 0)));

    assertTrue(engine.eligible(staff(), service(), true, rules, List.of(booking), at(10, 0), zone));
  }

  @Test
  void datedUnavailabilityBlocksOnlyItsOwnTenantAndStaff() {
    var exception = new StaffUnavailability();
    exception.tenantId = tenantId;
    exception.staffId = staffId;
    exception.startAt = at(10, 0);
    exception.endAt = at(11, 0);
    exception.reason = "Training";
    var rules = List.of(rule(Model.AvailabilityType.WORKING, LocalTime.of(9, 0), LocalTime.of(17, 0)));

    assertFalse(engine.eligible(staff(), service(), true, rules, List.of(), List.of(exception), at(10, 0), zone));
    assertTrue(engine.eligible(staff(), service(), true, rules, List.of(), List.of(exception), at(11, 0), zone));
    exception.tenantId = UUID.randomUUID();
    assertTrue(engine.eligible(staff(), service(), true, rules, List.of(), List.of(exception), at(10, 0), zone));
  }

  @Test
  void inactiveServiceAndLongDurationAreRejected() {
    var rules = List.of(rule(Model.AvailabilityType.WORKING, LocalTime.of(9, 0), LocalTime.of(17, 0)));
    var inactive = service();
    inactive.status = Model.Status.INACTIVE;
    assertFalse(engine.eligible(staff(), inactive, true, rules, List.of(), at(10, 0), zone));

    var longService = service();
    longService.durationMinutes = 480;
    assertFalse(engine.eligible(staff(), longService, true, rules, List.of(), at(10, 0), zone));
  }

  @Test
  void workingWindowIncludesExactEdgesButNotOneNanosecondOutside() {
    var rules = List.of(rule(Model.AvailabilityType.WORKING, LocalTime.of(9, 0), LocalTime.of(17, 0)));
    assertTrue(engine.eligible(staff(), service(), true, rules, List.of(), at(9, 0), zone));
    assertTrue(engine.eligible(staff(), service(), true, rules, List.of(), at(16, 0), zone));
    assertFalse(engine.eligible(staff(), service(), true, rules, List.of(), at(9, 0).minusNanos(1), zone));
    assertFalse(engine.eligible(staff(), service(), true, rules, List.of(), at(16, 0).plusNanos(1), zone));
  }

  @ParameterizedTest
  @EnumSource(value = Model.AvailabilityType.class, names = {"BREAK", "OFF"})
  void nonWorkingWindowsUseHalfOpenOverlapBoundaries(Model.AvailabilityType type) {
    var rules = List.of(
        rule(Model.AvailabilityType.WORKING, LocalTime.of(9, 0), LocalTime.of(17, 0)),
        rule(type, LocalTime.of(12, 0), LocalTime.of(13, 0)));
    assertTrue(engine.eligible(staff(), service(), true, rules, List.of(), at(11, 0), zone));
    assertTrue(engine.eligible(staff(), service(), true, rules, List.of(), at(13, 0), zone));
    assertFalse(engine.eligible(staff(), service(), true, rules, List.of(), at(11, 0).plusNanos(1), zone));
    assertFalse(engine.eligible(staff(), service(), true, rules, List.of(), at(13, 0).minusNanos(1), zone));
    assertFalse(engine.eligible(staff(), service(), true, rules, List.of(), at(12, 0), zone));
  }

  @Test
  void confirmedBookingsUseHalfOpenOverlapBoundaries() {
    var booking = booking(at(12, 0), at(13, 0));
    var rules = List.of(rule(Model.AvailabilityType.WORKING, LocalTime.of(9, 0), LocalTime.of(17, 0)));
    assertTrue(engine.eligible(staff(), service(), true, rules, List.of(booking), at(11, 0), zone));
    assertTrue(engine.eligible(staff(), service(), true, rules, List.of(booking), at(13, 0), zone));
    assertFalse(engine.eligible(staff(), service(), true, rules, List.of(booking), at(11, 0).plusNanos(1), zone));
    assertFalse(engine.eligible(staff(), service(), true, rules, List.of(booking), at(13, 0).minusNanos(1), zone));
  }

  @Test
  void confirmedBookingForAnotherServiceStillOccupiesTheSameStaff() {
    var booked = booking(at(10, 0), at(11, 0));
    var requested = service();
    booked.serviceId = UUID.fromString("00000000-0000-0000-0000-000000000003");
    requested.id = UUID.fromString("00000000-0000-0000-0000-000000000004");
    assertFalse(engine.eligible(staff(), requested, true,
        List.of(rule(Model.AvailabilityType.WORKING, LocalTime.of(9, 0), LocalTime.of(17, 0))), List.of(booked), at(10, 0), zone));
  }

  @ParameterizedTest
  @ValueSource(ints = {0, -1, Integer.MIN_VALUE})
  void nonPositiveDurationIsIneligible(int duration) {
    var service = service();
    service.durationMinutes = duration;
    assertFalse(engine.eligible(staff(), service, true,
        List.of(rule(Model.AvailabilityType.WORKING, LocalTime.MIN, LocalTime.MAX)), List.of(), at(10, 0), zone));
  }

  @Test
  void serviceMustBelongToStaffTenant() {
    var service = service();
    service.tenantId = UUID.randomUUID();
    assertFalse(engine.eligible(staff(), service, true,
        List.of(rule(Model.AvailabilityType.WORKING, LocalTime.MIN, LocalTime.MAX)), List.of(), at(10, 0), zone));
  }

  @Test
  void foreignTenantAndForeignStaffWorkingRulesCannotGrantAvailability() {
    var tenantRule = rule(Model.AvailabilityType.WORKING, LocalTime.MIN, LocalTime.MAX);
    tenantRule.tenantId = UUID.randomUUID();
    var staffRule = rule(Model.AvailabilityType.WORKING, LocalTime.MIN, LocalTime.MAX);
    staffRule.staffId = UUID.randomUUID();
    var missingOwner = rule(Model.AvailabilityType.WORKING, LocalTime.MIN, LocalTime.MAX);
    missingOwner.staffId = null;
    var missingTenant = rule(Model.AvailabilityType.WORKING, LocalTime.MIN, LocalTime.MAX);
    missingTenant.tenantId = null;
    for (var foreign : List.of(tenantRule, staffRule, missingOwner, missingTenant)) {
      assertFalse(engine.eligible(staff(), service(), true, List.of(foreign), List.of(), at(10, 0), zone));
    }
  }

  @ParameterizedTest
  @EnumSource(value = Model.AvailabilityType.class, names = {"BREAK", "OFF"})
  void foreignNonWorkingRulesCannotBlockThisStaff(Model.AvailabilityType type) {
    var work = rule(Model.AvailabilityType.WORKING, LocalTime.MIN, LocalTime.MAX);
    var tenantRule = rule(type, LocalTime.of(10, 0), LocalTime.of(11, 0));
    tenantRule.tenantId = UUID.randomUUID();
    var staffRule = rule(type, LocalTime.of(10, 0), LocalTime.of(11, 0));
    staffRule.staffId = UUID.randomUUID();
    assertTrue(engine.eligible(staff(), service(), true, List.of(work, tenantRule, staffRule), List.of(), at(10, 0), zone));
  }

  @Test
  void foreignOrOwnerlessConfirmedBookingsDoNotBlockThisStaff() {
    var foreignTenant = booking(at(10, 0), at(11, 0));
    foreignTenant.tenantId = UUID.randomUUID();
    var foreignStaff = booking(at(10, 0), at(11, 0));
    foreignStaff.staffId = UUID.randomUUID();
    var missingStaff = booking(at(10, 0), at(11, 0));
    missingStaff.staffId = null;
    var missingTenant = booking(at(10, 0), at(11, 0));
    missingTenant.tenantId = null;
    assertTrue(engine.eligible(staff(), service(), true,
        List.of(rule(Model.AvailabilityType.WORKING, LocalTime.MIN, LocalTime.MAX)),
        List.of(foreignTenant, foreignStaff, missingStaff, missingTenant), at(10, 0), zone));
  }

  @Test
  void missingWrongDayInvalidAndSplitWorkingRulesCannotCoverAnEntireBooking() {
    var wrongDay = rule(Model.AvailabilityType.WORKING, LocalTime.MIN, LocalTime.MAX);
    wrongDay.dayOfWeek = DayOfWeek.TUESDAY;
    var reversed = rule(Model.AvailabilityType.WORKING, LocalTime.of(17, 0), LocalTime.of(9, 0));
    var empty = rule(Model.AvailabilityType.WORKING, LocalTime.NOON, LocalTime.NOON);
    assertFalse(engine.eligible(staff(), service(), true, List.of(), List.of(), at(10, 0), zone));
    assertFalse(engine.eligible(staff(), service(), true, List.of(wrongDay, reversed, empty), List.of(), at(10, 0), zone));
    assertFalse(engine.eligible(staff(), service(), true, List.of(
        rule(Model.AvailabilityType.WORKING, LocalTime.of(9, 0), LocalTime.of(10, 30)),
        rule(Model.AvailabilityType.WORKING, LocalTime.of(10, 30), LocalTime.of(12, 0))), List.of(), at(10, 0), zone));
  }

  @Test
  void bookingCannotCrossTenantLocalMidnightEvenWhenUtcDateDoesNotChange() {
    var rules = List.of(rule(Model.AvailabilityType.WORKING, LocalTime.MIN, LocalTime.MAX));
    assertFalse(engine.eligible(staff(), service(), true, rules, List.of(), at(23, 30), zone));
    assertFalse(engine.eligible(staff(), service(), true, rules, List.of(), at(23, 0), zone));
  }

  @Test
  void weekdayUsesTenantLocalDateRatherThanUtcDate() {
    var service = service();
    service.durationMinutes = 30;
    assertTrue(engine.eligible(staff(), service, true,
        List.of(rule(Model.AvailabilityType.WORKING, LocalTime.MIN, LocalTime.of(2, 0))), List.of(), at(0, 30), zone));
    assertEquals(DayOfWeek.SUNDAY, at(0, 30).atZone(ZoneOffset.UTC).getDayOfWeek());
  }

  @Test
  void springGapShiftsWorkingStartForwardByTheGapDuration() {
    var rules = List.of(sunday(Model.AvailabilityType.WORKING, "02:15", "04:00"));
    assertFalse(dstEligible(30, rules, "2026-03-08T07:00:00Z"));
    assertTrue(dstEligible(30, rules, "2026-03-08T07:15:00Z"));
    assertTrue(dstEligible(30, rules, "2026-03-08T07:30:00Z"));
    assertFalse(dstEligible(30, rules, "2026-03-08T07:30:00.000000001Z"));
  }

  @Test
  void springGapShiftsWorkingEndAndMeasuresDurationAsElapsedTime() {
    var rules = List.of(sunday(Model.AvailabilityType.WORKING, "01:00", "02:30"));
    // 01:30 EST + 60 elapsed minutes = 03:30 EDT, the shifted 02:30 boundary.
    assertTrue(dstEligible(60, rules, "2026-03-08T06:30:00Z"));
    assertFalse(dstEligible(60, rules, "2026-03-08T06:30:00.000000001Z"));
  }

  @ParameterizedTest
  @EnumSource(value = Model.AvailabilityType.class, names = {"BREAK", "OFF"})
  void springGapShiftsBothNonWorkingBoundaries(Model.AvailabilityType type) {
    var rules = List.of(sunday(Model.AvailabilityType.WORKING, "00:00", "05:00"), sunday(type, "02:15", "02:45"));
    assertTrue(dstEligible(15, rules, "2026-03-08T07:00:00Z"));
    assertFalse(dstEligible(15, rules, "2026-03-08T07:00:00.000000001Z"));
    assertFalse(dstEligible(15, rules, "2026-03-08T07:30:00Z"));
    assertTrue(dstEligible(15, rules, "2026-03-08T07:45:00Z"));
  }

  @Test
  void gapShiftThatReversesAWorkingWindowDoesNotGrantAvailability() {
    var rules = List.of(sunday(Model.AvailabilityType.WORKING, "02:45", "03:15"));
    assertFalse(dstEligible(15, rules, "2026-03-08T07:00:00Z"));
    assertFalse(dstEligible(15, rules, "2026-03-08T07:45:00Z"));
  }

  @ParameterizedTest
  @EnumSource(value = Model.AvailabilityType.class, names = {"BREAK", "OFF"})
  void fallRepeatedNonWorkingWindowBlocksBothOccurrencesAndLocalClockReversal(Model.AvailabilityType type) {
    var rules = List.of(sunday(Model.AvailabilityType.WORKING, "00:00", "04:00"), sunday(type, "01:30", "01:45"));
    assertTrue(dstEligible(30, rules, "2026-11-01T05:00:00Z"));
    assertFalse(dstEligible(15, rules, "2026-11-01T05:30:00Z"));
    assertFalse(dstEligible(15, rules, "2026-11-01T06:30:00Z"));
    // 01:50 EDT -> 01:20 EST looks outside the break in wall time, but overlaps in instants.
    assertFalse(dstEligible(30, rules, "2026-11-01T05:50:00Z"));
    assertTrue(dstEligible(30, rules, "2026-11-01T06:45:00Z"));
    assertFalse(dstEligible(30, rules, "2026-11-01T06:44:59.999999999Z"));
  }

  @Test
  void fallWorkingBoundaryUsesEarlierStartLaterEndAndElapsedDuration() {
    var rules = List.of(sunday(Model.AvailabilityType.WORKING, "01:00", "01:30"));
    assertTrue(dstEligible(30, rules, "2026-11-01T05:00:00Z"));
    assertTrue(dstEligible(60, rules, "2026-11-01T05:30:00Z"));
    assertTrue(dstEligible(30, rules, "2026-11-01T06:00:00Z"));
    assertFalse(dstEligible(30, rules, "2026-11-01T04:59:59.999999999Z"));
    assertFalse(dstEligible(30, rules, "2026-11-01T06:00:00.000000001Z"));
  }

  private Booking booking(Instant start, Instant end) {
    var booking = new Booking();
    booking.tenantId = tenantId;
    booking.staffId = staffId;
    booking.status = Model.BookingStatus.CONFIRMED;
    booking.startAt = start;
    booking.endAt = end;
    return booking;
  }

  private StaffAvailability sunday(Model.AvailabilityType type, String start, String end) {
    var rule = rule(type, LocalTime.parse(start), LocalTime.parse(end));
    rule.dayOfWeek = DayOfWeek.SUNDAY;
    return rule;
  }

  private boolean dstEligible(int minutes, List<StaffAvailability> rules, String start) {
    var service = service();
    service.durationMinutes = minutes;
    return engine.eligible(staff(), service, true, rules, List.of(), Instant.parse(start), newYork);
  }
}
