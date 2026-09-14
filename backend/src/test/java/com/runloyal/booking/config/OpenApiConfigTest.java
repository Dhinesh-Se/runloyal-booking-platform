package com.runloyal.booking.config;

import static org.assertj.core.api.Assertions.assertThat;

import io.swagger.v3.oas.models.security.SecurityScheme;
import org.junit.jupiter.api.Test;

class OpenApiConfigTest {
    @Test
    void declaresJwtBearerSecurityForGeneratedApiOperations() {
        var api = new OpenApiConfig().bookingOpenApi();
        var schemes = api.getComponents().getSecuritySchemes();

        assertThat(schemes).containsOnlyKeys("bearerAuth");
        var bearer = schemes.get("bearerAuth");
        assertThat(bearer.getType()).isEqualTo(SecurityScheme.Type.HTTP);
        assertThat(bearer.getScheme()).isEqualTo("bearer");
        assertThat(bearer.getBearerFormat()).isEqualTo("JWT");
        assertThat(bearer.getDescription()).contains("access token", "issuer", "audience", "ID token");
        assertThat(api.getSecurity()).hasSize(1);
        assertThat(api.getSecurity().get(0)).containsOnlyKeys("bearerAuth");
        assertThat(api.getSecurity().get(0).get("bearerAuth")).isEmpty();
        // Paths are discovered from controllers, not manually fabricated by this configuration.
        assertThat(api.getPaths()).isNull();
    }

    @Test
    void documentsRolesMembershipRangeAndTimeSemantics() {
        var info = new OpenApiConfig().bookingOpenApi().getInfo();

        assertThat(info.getTitle()).isEqualTo("RunLoyal Booking API");
        assertThat(info.getVersion()).isEqualTo("1.0.0");
        assertThat(info.getDescription()).contains(
                "Reads allow TENANT_ADMIN and STAFF; all writes require TENANT_ADMIN",
                "active server-side users record", "users.okta_subject",
                "not client-supplied tenant IDs or role claims",
                "from < to", "range <= 31 days", "explicit UTC (Z)", "2030-01-07T10:00:00Z",
                "half-open [startAt, endAt)", "Recurring availability", "tenant-local wall-clock",
                "IANA timezone", "not UTC", "DST", "OpenAPI document are public");
    }
}