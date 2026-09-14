package com.runloyal.booking.web.dto.request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;

public record UnavailabilityCommand(@NotNull Instant startAt, @NotNull Instant endAt,
        @Size(max = 240) String reason) {}
