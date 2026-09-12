package com.runloyal.booking.web.dto.response;

import java.time.Instant;
import java.util.List;

public record AvailableSlotResponse(
        Instant startAt, Instant endAt, List<StaffResponse> availableStaff) {
}