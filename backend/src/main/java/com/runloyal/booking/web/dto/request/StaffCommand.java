package com.runloyal.booking.web.dto.request;

import com.runloyal.booking.domain.Model;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record StaffCommand(@NotBlank @Size(max = 120) String name, Model.Status status) {
}
