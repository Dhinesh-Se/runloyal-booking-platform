package com.runloyal.booking.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.runloyal.booking.Application;
import com.runloyal.booking.domain.AppUser;
import com.runloyal.booking.domain.Model;
import com.runloyal.booking.web.dto.request.AvailabilityCommand;
import com.runloyal.booking.web.dto.request.BookingCommand;
import com.runloyal.booking.web.dto.request.UnavailabilityCommand;
import java.time.Instant;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidationException;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.ResultMatcher;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Full production HTTP/filter/service/repository integration against an isolated H2 database.
 * Hibernate creates the schema with production-style binary UUIDs; this is NOT proof of MySQL
 * migration compatibility, MySQL locking semantics, or concurrent booking correctness.
 * Only the decoder is replaced: opaque bearer tokens still traverse the real security chain.
 * A mocked decoder is NOT proof of JWT cryptographic, issuer, or audience validation or real Okta
 * interoperability. No outer test transaction hides the production transaction boundaries.
 * RepositoryIntegrationSupport owns repository-only fixtures and checks the JDBC URL before seeding.
 */
@Tag("Layer1")
@Execution(ExecutionMode.SAME_THREAD)
@SpringBootTest(classes = Application.class, properties = {
        "spring.config.import=",
        "spring.config.location=optional:classpath:/integration-tests-no-config/",
        "spring.flyway.enabled=false",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.database-platform=org.hibernate.dialect.H2Dialect",
        "spring.jpa.properties.hibernate.type.preferred_uuid_jdbc_type=BINARY",
        "spring.jpa.open-in-view=false",
        "spring.sql.init.mode=never",
        "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://example.okta.com/oauth2/default",
        "spring.security.oauth2.resourceserver.jwt.audience=api://default"
})
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class BookingHttpIntegrationTest extends RepositoryIntegrationSupport {
    private static final String JDBC_URL = "jdbc:h2:mem:booking_http_"
            + UUID.randomUUID().toString().replace("-", "")
            + ";DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE";

    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper objectMapper;

    // Replace the named Nimbus factory bean before it can perform issuer discovery.
        @MockitoBean(name = "jwtDecoder", enforceOverride = true)
    private JwtDecoder jwtDecoder;

    @DynamicPropertySource
    static void isolatedDatabase(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> JDBC_URL);
        registry.add("spring.datasource.username", () -> "sa");
        registry.add("spring.datasource.password", () -> "");
        registry.add("spring.datasource.driver-class-name", () -> "org.h2.Driver");
        // Pin direct Hikari properties as well; ambient database settings must not win.
        registry.add("spring.datasource.hikari.jdbc-url", () -> JDBC_URL);
        registry.add("spring.datasource.hikari.username", () -> "sa");
        registry.add("spring.datasource.hikari.password", () -> "");
        registry.add("spring.datasource.hikari.driver-class-name", () -> "org.h2.Driver");
    }

    @Override
    protected String expectedJdbcUrl() {
        return JDBC_URL;
    }

    @Test
    void missingBearerUsesTheProductionStructuredUnauthorizedResponse() throws Exception {
        mvc.perform(get("/api/me"))
                .andExpect(apiError(401, "UNAUTHORIZED"))
                .andExpect(jsonPath("$.message").value("Authentication is required"))
                .andExpect(header().string(HttpHeaders.WWW_AUTHENTICATE, "Bearer"));
        verifyNoInteractions(jwtDecoder);
    }

    @Test
    void rejectedBearerTokensUseStructuredErrorsAndSanitizedResourceServerChallenges() throws Exception {
        String sensitive = "private-claim customer@example.test signing-key-internal";
        for (var failure : List.of(
                new BadJwtException("Malformed token: " + sensitive),
                new JwtValidationException("Rejected claims: " + sensitive,
                        List.of(new OAuth2Error("invalid_token", sensitive, "https://internal.example.test/keys"))))) {
            String opaque = UUID.randomUUID().toString();
            when(jwtDecoder.decode(opaque)).thenThrow(failure);
            // The real bearer filter must use our entry point, not a test SecurityContext.
            mvc.perform(get("/api/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + opaque))
                    .andExpect(apiError(401, "UNAUTHORIZED"))
                    .andExpect(jsonPath("$.message").value("Authentication is required"))
                    .andExpect(header().string(HttpHeaders.WWW_AUTHENTICATE, "Bearer error=\"invalid_token\""))
                    .andExpect(content().string(not(containsString(sensitive))))
                    .andExpect(content().string(not(containsString(opaque))))
                    .andExpect(content().string(not(containsString("internal.example.test"))));
        }
    }

    @Test
    void malformedBearerHeaderAlsoUsesTheSanitizedEntryPointBeforeDecoding() throws Exception {
        mvc.perform(get("/api/me").header(HttpHeaders.AUTHORIZATION, "Bearer private invalid token"))
                .andExpect(apiError(401, "UNAUTHORIZED"))
                .andExpect(jsonPath("$.message").value("Authentication is required"))
                .andExpect(header().string(HttpHeaders.WWW_AUTHENTICATE, "Bearer error=\"invalid_token\""))
                .andExpect(content().string(not(containsString("private invalid token"))));
        verifyNoInteractions(jwtDecoder);
    }

    @Test
    void swaggerUiEntryPointAndRedirectTargetArePublic() throws Exception {
        mvc.perform(get("/swagger-ui.html"))
                .andExpect(status().is3xxRedirection())
                .andExpect(redirectedUrl("/swagger-ui/index.html"));
        mvc.perform(get("/swagger-ui/index.html"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_HTML));
        verifyNoInteractions(jwtDecoder);
    }

    @Test
    void publicOpenApiDocumentDescribesRealPathsAndJwtSecurity() throws Exception {
        var response = mvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.info.title").value("RunLoyal Booking API"))
                .andExpect(jsonPath("$.components.securitySchemes.bearerAuth.type").value("http"))
                .andExpect(jsonPath("$.components.securitySchemes.bearerAuth.scheme").value("bearer"))
                .andExpect(jsonPath("$.components.securitySchemes.bearerAuth.bearerFormat").value("JWT"))
                .andExpect(jsonPath("$.security[0].bearerAuth").isArray())
                .andExpect(jsonPath("$.security[0].bearerAuth").isEmpty());
        JsonNode document = responseJson(response);
        JsonNode paths = document.path("paths");
        for (String path : List.of(
                "/api/me", "/api/bookings", "/api/bookings/{id}", "/api/bookings/{id}/cancel",
                "/api/services", "/api/services/{id}", "/api/services/{service}/available-staff",
                "/api/services/{service}/available-slots", "/api/services/{service}/staff",
                "/api/services/{service}/staff/{staff}", "/api/staff", "/api/staff/{id}",
                "/api/staff/{staff}/availability", "/api/staff/{staff}/availability/{id}",
                "/api/staff/{staff}/unavailability", "/api/staff/{staff}/unavailability/{id}")) {
            assertThat(paths.has(path)).as("Documented production path %s", path).isTrue();
        }
        assertThat(paths.path("/api/bookings").has("get")).isTrue();
        assertThat(paths.path("/api/bookings").has("post")).isTrue();
        assertThat(paths.path("/api/bookings/{id}/cancel").has("post")).isTrue();
        // Catalog GET-by-ID operations do not exist; do not invent them in the contract.
        assertThat(paths.path("/api/services/{id}").has("get")).isFalse();
        assertThat(paths.path("/api/staff/{id}").has("get")).isFalse();
        assertThat(document.path("info").path("description").asText())
                .contains("TENANT_ADMIN", "STAFF", "users.okta_subject", "range <= 31 days",
                        "explicit UTC (Z)", "tenant-local", "IANA timezone");
        verifyNoInteractions(jwtDecoder);
    }

    @Test
    void onlyProvisionedActiveSubjectsCanResolveTenantMembership() throws Exception {
        performAs(local.admin(), get("/api/me"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tenantId").value(local.tenant().id.toString()))
                .andExpect(jsonPath("$.oktaSubject").value(local.admin().oktaSubject));
        performAs(foreign.admin(), get("/api/me"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tenantId").value(foreign.tenant().id.toString()));
        for (String subject : List.of(local.inactive().oktaSubject, "external-" + UUID.randomUUID())) {
            performWithSubject(subject, get("/api/me"))
                    .andExpect(apiError(403, "FORBIDDEN"))
                    .andExpect(jsonPath("$.message").value("No active tenant membership"));
            performWithSubject(subject, get("/api/services"))
                    .andExpect(apiError(403, "FORBIDDEN"));
            performWithSubject(subject, body(post("/api/bookings"), command(local, START)))
                    .andExpect(apiError(403, "FORBIDDEN"));
        }
    }

    @Test
    void staffMembersCanReadButCannotPerformAnySupportedMutation() throws Exception {
        var existing = bookings.saveAndFlush(bookingRow(local, START));
        String bookingPath = "/api/bookings/" + existing.id;
        String servicePath = "/api/services/" + local.service().id;
        String staffPath = "/api/staff/" + local.staff().id;
        String assignmentPath = servicePath + "/staff/" + local.staff().id;
        String availabilityPath = staffPath + "/availability";

        performAs(local.member(), get("/api/me"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.role").value("STAFF"));
        for (var request : List.of(
                get("/api/services"), get("/api/staff"), get(servicePath + "/staff"),
                get(availabilityPath), get(bookingPath), calendarRequest(),
                get(servicePath + "/available-staff").param("startAt", START.plusSeconds(3600).toString()),
                get(servicePath + "/available-slots").param("from", START.toString())
                        .param("to", START.plusSeconds(7200).toString()))) {
            performAs(local.member(), request).andExpect(status().isOk());
        }
        // Valid, local resource IDs and payloads ensure these are role denials, not validation failures.
        for (var request : List.of(
                body(post("/api/bookings"), command(local, START.plusSeconds(3600))),
                post(bookingPath + "/cancel"),
                body(post("/api/staff"), staffCommand()), body(put(staffPath), staffCommand()),
                body(post("/api/services"), serviceCommand()), body(put(servicePath), serviceCommand()),
                delete(servicePath), post(assignmentPath), delete(assignmentPath),
                body(post(availabilityPath), workingCommand()),
                body(put(availabilityPath + "/" + local.working().id), workingCommand()),
                delete(availabilityPath + "/" + local.working().id))) {
            performAs(local.member(), request).andExpect(apiError(403, "FORBIDDEN"));
        }
        assertThat(bookings.findById(existing.id).orElseThrow().status).isEqualTo(Model.BookingStatus.CONFIRMED);
        assertThat(services.findById(local.service().id).orElseThrow().status).isEqualTo(Model.Status.ACTIVE);
        assertThat(assignments.existsByTenantIdAndStaffIdAndServiceId(
                local.tenant().id, local.staff().id, local.service().id)).isTrue();
        assertThat(availabilities.findById(local.working().id)).isPresent();
    }

    @Test
    void bookingConflictCancellationAndRebookingPersistAcrossHttpRequests() throws Exception {
        String slotsPath = "/api/services/" + local.service().id + "/available-slots";
        performAs(local.admin(), slotsRequest(slotsPath))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].availableStaff[*].id").value(contains(local.staff().id.toString())));
        var created = performAs(local.admin(), body(post("/api/bookings"), command(local, START)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.tenantId").value(local.tenant().id.toString()))
                .andExpect(jsonPath("$.serviceId").value(local.service().id.toString()))
                .andExpect(jsonPath("$.staffId").value(local.staff().id.toString()))
                .andExpect(jsonPath("$.startAt").value(START.toString()))
                .andExpect(jsonPath("$.endAt").value(START.plusSeconds(3600).toString()))
                .andExpect(jsonPath("$.status").value("CONFIRMED"));
        UUID firstId = responseId(created);
        performAs(local.admin(), get("/api/bookings/" + firstId))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(firstId.toString()));
        performAs(local.admin(), body(post("/api/bookings"), command(local, START)))
                .andExpect(apiError(409, "CONFLICT"));
        performAs(local.admin(), slotsRequest(slotsPath))
                .andExpect(status().isOk()).andExpect(jsonPath("$").isEmpty());
        performAs(local.admin(), post("/api/bookings/" + firstId + "/cancel"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED"));
        performAs(local.admin(), get("/api/bookings/" + firstId))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED"));
        performAs(local.admin(), post("/api/bookings/" + firstId + "/cancel"))
                .andExpect(apiError(409, "CONFLICT"));
        performAs(local.admin(), slotsRequest(slotsPath))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
        UUID secondId = responseId(performAs(local.admin(), body(post("/api/bookings"), command(local, START)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("CONFIRMED")));
        assertThat(secondId).isNotEqualTo(firstId);
        assertThat(bookings.findById(firstId).orElseThrow().status).isEqualTo(Model.BookingStatus.CANCELLED);
        assertThat(bookings.findById(secondId).orElseThrow().status).isEqualTo(Model.BookingStatus.CONFIRMED);
        performAs(local.admin(), calendarRequest()).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2));
    }

    @Test
    void catalogListsAreTenantScopedAndForeignCatalogWritesAreNotFound() throws Exception {
        // There are no service/staff GET-by-ID routes: use the actual list endpoints.
        for (Fixture fixture : List.of(local, foreign)) {
            performAs(fixture.admin(), get("/api/services")).andExpect(status().isOk())
                    .andExpect(jsonPath("$[*].id").value(contains(fixture.service().id.toString())))
                    .andExpect(jsonPath("$[*].tenantId").value(contains(fixture.tenant().id.toString())));
            performAs(fixture.admin(), get("/api/staff")).andExpect(status().isOk())
                    .andExpect(jsonPath("$[*].id").value(contains(fixture.staff().id.toString())))
                    .andExpect(jsonPath("$[*].tenantId").value(contains(fixture.tenant().id.toString())));
        }
        JsonNode originalServices = responseJson(performAs(foreign.admin(), get("/api/services")));
        JsonNode originalStaff = responseJson(performAs(foreign.admin(), get("/api/staff")));
        performAs(local.admin(), body(put("/api/services/" + foreign.service().id), serviceCommand()))
                .andExpect(apiError(404, "NOT_FOUND"));
        performAs(local.admin(), delete("/api/services/" + foreign.service().id))
                .andExpect(apiError(404, "NOT_FOUND"));
        performAs(local.admin(), body(put("/api/staff/" + foreign.staff().id), staffCommand()))
                .andExpect(apiError(404, "NOT_FOUND"));
        assertThat(responseJson(performAs(foreign.admin(), get("/api/services")))).isEqualTo(originalServices);
        assertThat(responseJson(performAs(foreign.admin(), get("/api/staff")))).isEqualTo(originalStaff);

        performAs(local.admin(), body(put("/api/services/" + local.service().id), serviceCommand()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.name").value(serviceCommand().name()));
        performAs(local.admin(), body(put("/api/staff/" + local.staff().id), staffCommand()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.name").value(staffCommand().name()));
        performAs(local.admin(), delete("/api/services/" + local.service().id)).andExpect(status().isNoContent());
        performAs(local.admin(), get("/api/services"))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].status").value("INACTIVE"));
    }

    @Test
    void assignmentsValidateServiceAndStaffOwnershipBeforeReadingOrMutating() throws Exception {
        String localPath = "/api/services/" + local.service().id + "/staff";
        String foreignPath = "/api/services/" + foreign.service().id + "/staff";
        performAs(local.admin(), get(foreignPath)).andExpect(apiError(404, "NOT_FOUND"));
        performAs(local.admin(), get("/api/services/" + UUID.randomUUID() + "/staff"))
                .andExpect(apiError(404, "NOT_FOUND"));
        // The read route has only a service dimension; its exact list must exclude foreign staff.
        UUID[][] wrongPairs = {
                {foreign.service().id, local.staff().id},
                {local.service().id, foreign.staff().id},
                {foreign.service().id, foreign.staff().id},
                {UUID.randomUUID(), local.staff().id},
                {local.service().id, UUID.randomUUID()}
        };
        for (UUID[] pair : wrongPairs) {
            String path = "/api/services/" + pair[0] + "/staff/" + pair[1];
            performAs(local.admin(), post(path)).andExpect(apiError(404, "NOT_FOUND"));
            performAs(local.admin(), delete(path)).andExpect(apiError(404, "NOT_FOUND"));
        }
        performAs(local.admin(), get(localPath)).andExpect(status().isOk())
                .andExpect(jsonPath("$[*].id").value(contains(local.staff().id.toString())));
        performAs(foreign.admin(), get(foreignPath)).andExpect(status().isOk())
                .andExpect(jsonPath("$[*].id").value(contains(foreign.staff().id.toString())));
        String assignmentPath = localPath + "/" + local.staff().id;
        performAs(local.admin(), post(assignmentPath)).andExpect(apiError(409, "CONFLICT"));
        performAs(local.admin(), delete(assignmentPath)).andExpect(status().isNoContent());
        performAs(local.admin(), get(localPath)).andExpect(status().isOk()).andExpect(jsonPath("$").isEmpty());
        performAs(local.admin(), post(assignmentPath)).andExpect(status().isNoContent());
        performAs(local.admin(), get(localPath)).andExpect(status().isOk())
                .andExpect(jsonPath("$[*].id").value(contains(local.staff().id.toString())));
    }

    @Test
    void availabilityValidatesTenantAndParentResourceForEverySupportedVerb() throws Exception {
        String localPath = "/api/staff/" + local.staff().id + "/availability";
        UUID missingStaff = UUID.randomUUID();
        UUID anotherLocalStaff = responseId(performAs(local.admin(), body(post("/api/staff"), staffCommand()))
                .andExpect(status().isCreated()));
        for (UUID staffId : List.of(foreign.staff().id, missingStaff)) {
            String path = "/api/staff/" + staffId + "/availability";
            performAs(local.admin(), get(path)).andExpect(apiError(404, "NOT_FOUND"));
            performAs(local.admin(), body(post(path), workingCommand())).andExpect(apiError(404, "NOT_FOUND"));
        }
        UUID[][] wrongPairs = {
                {local.staff().id, foreign.working().id},
                {foreign.staff().id, local.working().id},
                {foreign.staff().id, foreign.working().id},
                {anotherLocalStaff, local.working().id},
                {local.staff().id, UUID.randomUUID()},
                {missingStaff, local.working().id}
        };
        for (UUID[] pair : wrongPairs) {
            String path = "/api/staff/" + pair[0] + "/availability/" + pair[1];
            performAs(local.admin(), body(put(path), workingCommand())).andExpect(apiError(404, "NOT_FOUND"));
            performAs(local.admin(), delete(path)).andExpect(apiError(404, "NOT_FOUND"));
        }
        performAs(local.admin(), get(localPath)).andExpect(status().isOk())
                .andExpect(jsonPath("$[*].id").value(contains(local.working().id.toString())));
        performAs(foreign.admin(), get("/api/staff/" + foreign.staff().id + "/availability"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].id").value(contains(foreign.working().id.toString())));
        performAs(local.admin(), body(put(localPath + "/" + local.working().id), workingCommand()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(local.working().id.toString()));
        performAs(local.admin(), delete(localPath + "/" + local.working().id)).andExpect(status().isNoContent());
        performAs(local.admin(), get(localPath)).andExpect(status().isOk()).andExpect(jsonPath("$").isEmpty());
        UUID replacement = responseId(performAs(local.admin(), body(post(localPath), workingCommand()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.staffId").value(local.staff().id.toString())));
        performAs(local.admin(), get(localPath)).andExpect(status().isOk())
                .andExpect(jsonPath("$[*].id").value(contains(replacement.toString())));
    }

    @Test
    void datedUnavailabilityIsTenantScopedAndBlocksBookingUntilDeleted() throws Exception {
        String localPath = "/api/staff/" + local.staff().id + "/unavailability";
        var command = new UnavailabilityCommand(START, START.plusSeconds(3600), "Training");
        UUID id = responseId(performAs(local.admin(), body(post(localPath), command))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.staffId").value(local.staff().id.toString())));
        performAs(local.admin(), get(localPath)).andExpect(status().isOk())
                .andExpect(jsonPath("$[*].id").value(contains(id.toString())));
        performAs(local.admin(), body(post("/api/bookings"), command(local, START)))
                .andExpect(apiError(409, "CONFLICT"));
        performAs(local.admin(), get("/api/staff/" + foreign.staff().id + "/unavailability"))
                .andExpect(apiError(404, "NOT_FOUND"));
        performAs(local.admin(), delete("/api/staff/" + local.staff().id + "/unavailability/" + id))
                .andExpect(status().isNoContent());
        performAs(local.admin(), body(post("/api/bookings"), command(local, START)))
                .andExpect(status().isCreated());
    }

    @Test
    void bookingsAndCalendarsCannotReadCancelOrCreateAcrossTenantBoundaries() throws Exception {
        UUID foreignId = responseId(performAs(foreign.admin(), body(post("/api/bookings"), command(foreign, START)))
                .andExpect(status().isCreated()));
        UUID localId = responseId(performAs(local.admin(), body(post("/api/bookings"), command(local, START)))
                .andExpect(status().isCreated()));
        performAs(local.admin(), get("/api/bookings/" + foreignId)).andExpect(apiError(404, "NOT_FOUND"));
        performAs(local.admin(), post("/api/bookings/" + foreignId + "/cancel"))
                .andExpect(apiError(404, "NOT_FOUND"));
        performAs(foreign.admin(), get("/api/bookings/" + localId)).andExpect(apiError(404, "NOT_FOUND"));
        performAs(foreign.admin(), post("/api/bookings/" + localId + "/cancel"))
                .andExpect(apiError(404, "NOT_FOUND"));
        UUID[][] wrongPairs = {
                {foreign.service().id, local.staff().id},
                {local.service().id, foreign.staff().id},
                {foreign.service().id, foreign.staff().id}
        };
        for (UUID[] pair : wrongPairs) {
            var command = new BookingCommand(pair[0], pair[1], START.plusSeconds(3600), "Customer", "Pet");
            performAs(local.admin(), body(post("/api/bookings"), command)).andExpect(apiError(404, "NOT_FOUND"));
        }
        String foreignServicePath = "/api/services/" + foreign.service().id;
        performAs(local.admin(), get(foreignServicePath + "/available-staff").param("startAt", START.toString()))
                .andExpect(apiError(404, "NOT_FOUND"));
        performAs(local.admin(), slotsRequest(foreignServicePath + "/available-slots"))
                .andExpect(apiError(404, "NOT_FOUND"));
        for (Fixture fixture : List.of(local, foreign)) {
            UUID expectedId = fixture == local ? localId : foreignId;
            for (AppUser reader : List.of(fixture.admin(), fixture.member())) {
                performAs(reader, calendarRequest()).andExpect(status().isOk())
                        .andExpect(jsonPath("$[*].id").value(contains(expectedId.toString())))
                        .andExpect(jsonPath("$[*].tenantId").value(contains(fixture.tenant().id.toString())))
                        .andExpect(jsonPath("$[0].status").value("CONFIRMED"));
            }
        }
        assertThat(bookings.findById(foreignId).orElseThrow().status).isEqualTo(Model.BookingStatus.CONFIRMED);
        assertThat(bookings.findById(localId).orElseThrow().status).isEqualTo(Model.BookingStatus.CONFIRMED);
    }

    @Test
    void validationInvalidInputAndMissingResourcesUseStructuredApiErrors() throws Exception {
        performAs(local.admin(), body(post("/api/bookings"), Map.of()))
                .andExpect(apiError(400, "VALIDATION"))
                .andExpect(jsonPath("$.validationErrors.serviceId").isNotEmpty())
                .andExpect(jsonPath("$.validationErrors.staffId").isNotEmpty())
                .andExpect(jsonPath("$.validationErrors.startAt").isNotEmpty())
                .andExpect(jsonPath("$.validationErrors.customerName").isNotEmpty());
        for (String path : List.of("/api/services", "/api/staff", "/api/staff/" + local.staff().id + "/availability")) {
            performAs(local.admin(), body(post(path), Map.of())).andExpect(apiError(400, "VALIDATION"));
        }
        String availabilityPath = "/api/staff/" + local.staff().id + "/availability";
        var invalidWindow = new AvailabilityCommand(workingCommand().dayOfWeek(),
                LocalTime.of(18, 0), LocalTime.of(8, 0), Model.AvailabilityType.WORKING);
        performAs(local.admin(), body(post(availabilityPath), invalidWindow)).andExpect(apiError(422, "INVALID"));
        performAs(local.admin(), body(post(availabilityPath), workingCommand()))
                .andExpect(apiError(422, "INVALID"));
        for (String path : List.of("/api/bookings", "/api/services/" + local.service().id + "/available-slots")) {
            performAs(local.admin(), get(path).param("from", START.toString()).param("to", START.toString()))
                    .andExpect(apiError(422, "INVALID"));
            performAs(local.admin(), get(path).param("from", START.toString())
                    .param("to", START.plusSeconds(32 * 24 * 3600L).toString()))
                    .andExpect(apiError(422, "INVALID"));
        }
        String missingBooking = "/api/bookings/" + UUID.randomUUID();
        performAs(local.admin(), get(missingBooking)).andExpect(apiError(404, "NOT_FOUND"));
        performAs(local.admin(), post(missingBooking + "/cancel")).andExpect(apiError(404, "NOT_FOUND"));
    }

        @Test
        void malformedJsonAndInvalidBodyTypesReturnSanitizedBadRequests() throws Exception {
                String sensitive = "private-customer-payload";
                for (String payload : List.of(
                                "{\"customerName\":\"" + sensitive + "\",\"serviceId\":",
                                "[\"" + sensitive + "\"]",
                                "{\"serviceId\":\"" + sensitive + "\"}",
                                "{\"startAt\":\"" + sensitive + "\"}",
                                "")) {
                        performAs(local.admin(), post("/api/bookings").contentType(MediaType.APPLICATION_JSON).content(payload))
                                        .andExpect(sanitizedBadRequest())
                                        .andExpect(content().string(not(containsString(sensitive))));
                }
        }

        @Test
        void invalidUuidPathVariablesReturnBadRequestsRatherThanBusinessErrors() throws Exception {
                // UUIDs are path variables in this API, not query parameters.
                for (var request : List.of(
                                get("/api/bookings/not-a-uuid"),
                                get("/api/services/not-a-uuid/available-staff").param("startAt", START.toString()),
                                get("/api/staff/not-a-uuid/availability"))) {
                        performAs(local.admin(), request).andExpect(sanitizedBadRequest());
                }
        }

        @Test
        void invalidInstantQueryParametersReturnSanitizedBadRequests() throws Exception {
                String servicePath = "/api/services/" + local.service().id;
                for (String rejected : List.of("private-invalid-instant", "2030-01-07T10:00:00")) {
                        for (var request : List.of(
                                        get("/api/bookings").param("from", rejected).param("to", START.toString()),
                                        get("/api/bookings").param("from", START.toString()).param("to", rejected),
                                        get(servicePath + "/available-staff").param("startAt", rejected),
                                        get(servicePath + "/available-slots").param("from", rejected).param("to", START.toString()),
                                        get(servicePath + "/available-slots").param("from", START.toString()).param("to", rejected))) {
                                performAs(local.admin(), request).andExpect(sanitizedBadRequest())
                                                .andExpect(content().string(not(containsString(rejected))));
                        }
                }
        }

        @Test
        void missingRequiredQueryParametersReturnSanitizedBadRequests() throws Exception {
                String servicePath = "/api/services/" + local.service().id;
                for (var request : List.of(
                                get("/api/bookings"),
                                get("/api/bookings").param("from", START.toString()),
                                get("/api/bookings").param("to", START.toString()),
                                get("/api/bookings").param("from", "").param("to", START.toString()),
                                get(servicePath + "/available-staff"),
                                get(servicePath + "/available-slots"),
                                get(servicePath + "/available-slots").param("from", START.toString()),
                                get(servicePath + "/available-slots").param("to", START.toString()))) {
                        performAs(local.admin(), request.param("unrelated", "private-query-value"))
                                        .andExpect(sanitizedBadRequest())
                                        .andExpect(content().string(not(containsString("private-query-value"))));
                }
        }

        @Test
        void invalidEnumValuesReturnSanitizedBadRequests() throws Exception {
                performAs(local.admin(), body(post("/api/staff"),
                                Map.of("name", "private-customer", "status", "private-invalid-status")))
                                .andExpect(sanitizedBadRequest())
                                .andExpect(content().string(not(containsString("private-customer"))))
                                .andExpect(content().string(not(containsString("private-invalid-status"))));
        }

        @Test
        void unsupportedMethodsReturnStructuredErrorsAndSupportedMethodHeaders() throws Exception {
                for (var request : List.of(put("/api/bookings"), delete("/api/bookings"))) {
                        performAs(local.admin(), request)
                                        .andExpect(apiError(405, "METHOD_NOT_ALLOWED"))
                                        .andExpect(jsonPath("$.message").value("Request method is not supported"))
                                        .andExpect(header().exists(HttpHeaders.ALLOW))
                                        .andExpect(result -> assertThat(result.getResponse().getHeader(HttpHeaders.ALLOW).split(",\\s*"))
                                                        .contains("GET", "POST").doesNotContain("PUT", "DELETE"));
                }
                performAs(local.admin(), get("/api/bookings/" + UUID.randomUUID() + "/cancel"))
                                .andExpect(apiError(405, "METHOD_NOT_ALLOWED"))
                                .andExpect(jsonPath("$.message").value("Request method is not supported"))
                                .andExpect(header().string(HttpHeaders.ALLOW, "POST"));
        }

        private static ResultMatcher sanitizedBadRequest() {
                return result -> {
                        apiError(400, "BAD_REQUEST").match(result);
                        jsonPath("$.message").value("Request is malformed or contains invalid parameters").match(result);
                        jsonPath("$.exception").doesNotExist().match(result);
                        jsonPath("$.trace").doesNotExist().match(result);
                };
        }

        private ResultActions performAs(AppUser user, MockHttpServletRequestBuilder request) throws Exception {
        return performWithSubject(user.oktaSubject, request);
    }

    private ResultActions performWithSubject(String subject, MockHttpServletRequestBuilder request) throws Exception {
        String opaque = UUID.randomUUID().toString();
        when(jwtDecoder.decode(opaque)).thenReturn(token(opaque, subject));
        // Do not use jwt() or pre-populate SecurityContextHolder: exercise bearer authentication.
        return mvc.perform(request.header(HttpHeaders.AUTHORIZATION, "Bearer " + opaque));
    }

    private MockHttpServletRequestBuilder body(MockHttpServletRequestBuilder request, Object value) throws Exception {
        return request.contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsBytes(value));
    }

    private MockHttpServletRequestBuilder calendarRequest() {
        return get("/api/bookings").param("from", START.minusSeconds(3600).toString())
                .param("to", START.plusSeconds(7200).toString());
    }

    private MockHttpServletRequestBuilder slotsRequest(String path) {
        return get(path).param("from", START.toString()).param("to", START.plusSeconds(3600).toString());
    }

    private JsonNode responseJson(ResultActions response) throws Exception {
        return objectMapper.readTree(response.andReturn().getResponse().getContentAsByteArray());
    }

    private UUID responseId(ResultActions response) throws Exception {
        return UUID.fromString(responseJson(response).path("id").asText());
    }

    private static ResultMatcher apiError(int expectedStatus, String code) {
        return result -> {
            status().is(expectedStatus).match(result);
            content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON).match(result);
            jsonPath("$.status").value(expectedStatus).match(result);
            jsonPath("$.code").value(code).match(result);
            jsonPath("$.path").value(result.getRequest().getRequestURI()).match(result);
            jsonPath("$.timestamp").isNotEmpty().match(result);
            jsonPath("$.message").isNotEmpty().match(result);
            jsonPath("$.validationErrors").isMap().match(result);
            if ("VALIDATION".equals(code)) {
                jsonPath("$.validationErrors").isNotEmpty().match(result);
            } else {
                jsonPath("$.validationErrors").isEmpty().match(result);
            }
        };
    }
}
