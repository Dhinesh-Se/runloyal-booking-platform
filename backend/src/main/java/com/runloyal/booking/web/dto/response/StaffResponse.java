package com.runloyal.booking.web.dto.response;

import com.runloyal.booking.domain.Model;

import java.util.UUID;

public record StaffResponse(UUID id, UUID tenantId, UUID userId, String name, Model.Status status) {
}
