package com.runloyal.booking.web.dto.response;

import com.runloyal.booking.domain.Model;

import java.util.UUID;

public record UserResponse(
        UUID id,
        UUID tenantId,
        String tenantName,
        String timezone,
        String oktaSubject,
        Model.Role role,
        Model.Status status) {
}
