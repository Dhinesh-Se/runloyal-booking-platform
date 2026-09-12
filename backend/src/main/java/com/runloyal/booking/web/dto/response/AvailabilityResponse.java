package com.runloyal.booking.web.dto.response;

import com.runloyal.booking.domain.Model;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.UUID;

public record AvailabilityResponse(UUID id, UUID tenantId, UUID staffId, DayOfWeek dayOfWeek,
        LocalTime startTime, LocalTime endTime, Model.AvailabilityType type) {
}
