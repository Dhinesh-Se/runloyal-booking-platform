package com.runloyal.booking.web.dto.response;

import com.runloyal.booking.domain.Model;

import java.math.BigDecimal;
import java.util.UUID;

public record ServiceResponse(UUID id, UUID tenantId, String name, String description, String category,
        int durationMinutes, BigDecimal price, Model.Status status) {
}
