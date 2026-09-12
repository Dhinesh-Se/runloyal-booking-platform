package com.runloyal.booking.web.dto.response;

import com.runloyal.booking.domain.Model;

import java.time.Instant;
import java.util.UUID;

public record BookingResponse(UUID id, UUID tenantId, UUID serviceId, UUID staffId, Instant startAt,
        Instant endAt, Model.BookingStatus status, String customerName, String petName) {
}
