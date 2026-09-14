package com.runloyal.booking.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {
    @Bean
    OpenAPI bookingOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("RunLoyal Booking API")
                        .version("1.0.0")
                        .description("""
                                /api operations require an Okta access token (not an ID token) and active tenant membership.
                                Reads allow TENANT_ADMIN and STAFF; all writes require TENANT_ADMIN.
                                Tenant and role come from the active server-side users record matched by the exact
                                validated access-token sub (users.okta_subject), not client-supplied tenant IDs or role claims.

                                Booking calendar and available-slots queries require from < to and a range <= 31 days.
                                Booking startAt/endAt and query from/to/startAt are instants: use ISO-8601 timestamps
                                with explicit UTC (Z), for example 2030-01-07T10:00:00Z. Responses represent instants in UTC.
                                Booking intervals are half-open [startAt, endAt).
                                Recurring availability dayOfWeek/startTime/endTime are tenant-local wall-clock values,
                                interpreted in the tenant's configured IANA timezone, not UTC; timezone rules apply across DST.

                                Swagger UI and the OpenAPI document are public. The security requirement describes API
                                operations; it does not require authentication to retrieve the documentation itself.
                                """))
                .components(new Components().addSecuritySchemes("bearerAuth", new SecurityScheme()
                        .type(SecurityScheme.Type.HTTP)
                        .scheme("bearer")
                        .bearerFormat("JWT")
                        .description("Okta access token for this API's configured issuer and audience; do not use an ID token.")))
                .addSecurityItem(new SecurityRequirement().addList("bearerAuth"));
    }
}