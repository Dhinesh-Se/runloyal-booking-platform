package com.runloyal.booking.web.dto.response;

import java.time.Instant;
import java.util.UUID;

public record UnavailabilityResponse(UUID id, UUID tenantId, UUID staffId, Instant startAt, Instant endAt,
        String reason) {}
