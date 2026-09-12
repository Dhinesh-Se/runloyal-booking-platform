package com.runloyal.booking.web.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.UUID;

public record BookingCommand(@NotNull UUID serviceId, @NotNull UUID staffId, @NotNull Instant startAt,
        @NotBlank @Size(max = 120) String customerName, @Size(max = 120) String petName) {
}
