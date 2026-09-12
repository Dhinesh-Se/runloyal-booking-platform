package com.runloyal.booking.service;

import com.runloyal.booking.domain.*;
import java.time.*;
import java.util.*;

/**
 * Evaluates instants as tenant-local calendar times; slots are generated at 30-minute boundaries.
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
    if (staff.status != Model.Status.ACTIVE || service.status != Model.Status.ACTIVE || !assigned)
      return false;
    Instant end = start.plus(Duration.ofMinutes(service.durationMinutes));
    LocalDateTime local = LocalDateTime.ofInstant(start, zone),
        localEnd = LocalDateTime.ofInstant(end, zone);
    if (!local.toLocalDate().equals(localEnd.toLocalDate())) return false;
    var work =
        rules.stream()
            .filter(
                r ->
                    r.dayOfWeek == local.getDayOfWeek() && r.type == Model.AvailabilityType.WORKING)
            .anyMatch(
                r ->
                    !local.toLocalTime().isBefore(r.startTime)
                        && !localEnd.toLocalTime().isAfter(r.endTime));
    boolean breakHit =
        rules.stream()
            .filter(
                r ->
                    r.dayOfWeek == local.getDayOfWeek() && r.type != Model.AvailabilityType.WORKING)
            .anyMatch(
                r ->
                    local.toLocalTime().isBefore(r.endTime)
                        && localEnd.toLocalTime().isAfter(r.startTime));
    boolean booked =
        bookings.stream()
            .anyMatch(
                b ->
                    b.status == Model.BookingStatus.CONFIRMED
                        && start.isBefore(b.endAt)
                        && end.isAfter(b.startAt));
    return work && !breakHit && !booked;
  }
}
