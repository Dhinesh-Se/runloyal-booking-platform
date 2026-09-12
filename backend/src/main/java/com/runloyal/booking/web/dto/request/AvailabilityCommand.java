package com.runloyal.booking.web.dto.request;

import com.runloyal.booking.domain.Model;
import jakarta.validation.constraints.NotNull;

import java.time.DayOfWeek;
import java.time.LocalTime;

public record AvailabilityCommand(@NotNull DayOfWeek dayOfWeek, @NotNull LocalTime startTime,
        @NotNull LocalTime endTime, @NotNull Model.AvailabilityType type) {
}
