package com.runloyal.booking.web.dto.request;

import com.runloyal.booking.domain.Model;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

public record ServiceCommand(@NotBlank @Size(max = 120) String name,
        @Size(max = 1000) String description, @NotBlank @Size(max = 80) String category,
        @Positive int durationMinutes, @NotNull @DecimalMin("0.0") BigDecimal price,
        Model.Status status) {
}
