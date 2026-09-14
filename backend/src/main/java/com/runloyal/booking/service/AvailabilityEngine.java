package com.runloyal.booking.service;

import com.runloyal.booking.domain.*;
import java.time.*;
import java.util.*;

/**
 * Recurring schedules are same-day tenant-local windows (overnight rules are not supported).
 * Duration is elapsed time, not wall-clock time. All containment/overlap checks use instants.
 * On a repeated hour a window starts at the earlier offset and ends at the later offset;
 * a boundary in a gap is shifted forward by the zone's gap duration. Thus a BREAK/OFF
 * window conservatively blocks both occurrences of a repeated local time.
 */
public class AvailabilityEngine {
  public boolean eligible(
      Staff staff,
      ServiceOffering service,
      boolean assigned,
      List<StaffAvailability> rules,
      List<Booking> bookings,
      Instant start,
      ZoneId zone) {
    if (staff.status != Model.Status.ACTIVE || service.status != Model.Status.ACTIVE || !assigned
        || service.durationMinutes <= 0 || !Objects.equals(staff.tenantId, service.tenantId))
      return false;
    Instant end = start.plus(Duration.ofMinutes(service.durationMinutes));
    LocalDate date = start.atZone(zone).toLocalDate();
    if (!date.equals(end.atZone(zone).toLocalDate())) return false;
    var windows = rules.stream()
        .filter(r -> Objects.equals(r.tenantId, staff.tenantId)
            && Objects.equals(r.staffId, staff.id) && r.dayOfWeek == date.getDayOfWeek())
        .filter(r -> r.startTime.isBefore(r.endTime))
        .map(r -> new Window(r.type, boundary(date.atTime(r.startTime), zone, true),
            boundary(date.atTime(r.endTime), zone, false)))
        .filter(w -> w.start.isBefore(w.end))
        .toList();
    var work =
        windows.stream()
            .filter(w -> w.type == Model.AvailabilityType.WORKING)
            .anyMatch(w -> !start.isBefore(w.start) && !end.isAfter(w.end));
    boolean breakHit =
        windows.stream()
            .filter(w -> w.type != Model.AvailabilityType.WORKING)
            .anyMatch(w -> start.isBefore(w.end) && end.isAfter(w.start));
    boolean booked =
        bookings.stream()
            .anyMatch(
                b ->
                    Objects.equals(b.tenantId, staff.tenantId)
                        && Objects.equals(b.staffId, staff.id)
                        && b.status == Model.BookingStatus.CONFIRMED
                        && start.isBefore(b.endAt)
                        && end.isAfter(b.startAt));
    return work && !breakHit && !booked;
  }

    private static Instant boundary(LocalDateTime local, ZoneId zone, boolean start) {
        var zoned = local.atZone(zone); // ZoneRules shift nonexistent local times forward across gaps.
        return (start ? zoned.withEarlierOffsetAtOverlap() : zoned.withLaterOffsetAtOverlap()).toInstant();
    }

    private record Window(Model.AvailabilityType type, Instant start, Instant end) {}
}
