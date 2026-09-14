package com.runloyal.booking.common.exception;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.runloyal.booking.security.TenantContext;
import com.runloyal.booking.service.BookingFeatureService;
import com.runloyal.booking.web.controller.BookingController;
import com.runloyal.booking.web.mapper.ApiMapper;
import java.sql.SQLException;
import java.util.NoSuchElementException;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.dao.ConcurrencyFailureException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** Advice dispatch through an existing controller with injected failures; no DB or Spring context. */
class ErrorsTest {
    private static final UUID BOOKING_ID = UUID.fromString("11111111-1111-4111-8111-111111111111");
    private static final String PATH = "/api/bookings/" + BOOKING_ID;
    private static final String SENSITIVE = "select customer_email from private_bookings "
            + "where customer_email='private-customer@example.test'; constraint uk_private_tenant";

    private BookingFeatureService service;
    private ApiMapper mapper;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        service = mock(BookingFeatureService.class);
        mapper = mock(ApiMapper.class);
        mvc = MockMvcBuilders.standaloneSetup(new BookingController(service, mapper))
                .setControllerAdvice(new Errors()).build();
    }

    @ParameterizedTest
    @MethodSource("persistenceFailures")
    void integrityAndConcurrencyFailuresReturnSanitizedConflicts(RuntimeException failure) throws Exception {
        when(service.findBooking(BOOKING_ID)).thenThrow(failure);

        mvc.perform(get(PATH))
                .andExpect(status().isConflict())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.status").value(409))
                .andExpect(jsonPath("$.code").value("CONFLICT"))
                .andExpect(jsonPath("$.message").value("Request conflicts with the current resource state"))
                .andExpect(jsonPath("$.path").value(PATH))
                .andExpect(jsonPath("$.timestamp").isNotEmpty())
                .andExpect(jsonPath("$.validationErrors").isMap())
                .andExpect(jsonPath("$.validationErrors").isEmpty())
                .andExpect(jsonPath("$.exception").doesNotExist())
                .andExpect(jsonPath("$.trace").doesNotExist())
                .andExpect(content().string(not(containsString("private"))))
                .andExpect(content().string(not(containsString(failure.getClass().getSimpleName()))));

        verify(service).findBooking(BOOKING_ID);
        verifyNoInteractions(mapper);
    }

    static Stream<RuntimeException> persistenceFailures() {
        return Stream.of(
                new DataIntegrityViolationException(SENSITIVE, new SQLException(SENSITIVE, "23000", 1062)),
                new DuplicateKeyException(SENSITIVE),
                new ConcurrencyFailureException(SENSITIVE),
                new CannotAcquireLockException("Lock wait timeout: " + SENSITIVE,
                        new SQLException(SENSITIVE, "HY000", 1205)),
                new PessimisticLockingFailureException("Deadlock: " + SENSITIVE,
                        new SQLException(SENSITIVE, "40001", 1213)));
    }

    @ParameterizedTest
    @MethodSource("existingMappings")
    void existingBusinessAndFallbackMappingsRemainUnchanged(
            RuntimeException failure, int expectedStatus, String code, String message) throws Exception {
        when(service.findBooking(BOOKING_ID)).thenThrow(failure);

        mvc.perform(get(PATH))
                .andExpect(status().is(expectedStatus))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.status").value(expectedStatus))
                .andExpect(jsonPath("$.code").value(code))
                .andExpect(jsonPath("$.message").value(message))
                .andExpect(jsonPath("$.path").value(PATH))
                .andExpect(jsonPath("$.timestamp").isNotEmpty())
                .andExpect(jsonPath("$.validationErrors").isEmpty())
                .andExpect(content().string(not(containsString("private"))));
    }

    static Stream<Arguments> existingMappings() {
        return Stream.of(
                Arguments.of(new IllegalArgumentException("from must precede to"),
                        422, "INVALID", "from must precede to"),
                Arguments.of(new IllegalStateException("Invalid business state"),
                        422, "INVALID", "Invalid business state"),
                Arguments.of(new ConflictException("Requested slot is unavailable"),
                        409, "CONFLICT", "Requested slot is unavailable"),
                Arguments.of(new NoSuchElementException("Resource not found"),
                        404, "NOT_FOUND", "Resource not found"),
                Arguments.of(new ResourceNotFoundException(), 404, "NOT_FOUND", "Resource not found"),
                Arguments.of(new TenantContext.Forbidden("Tenant admin role required"),
                        403, "FORBIDDEN", "Tenant admin role required"),
                Arguments.of(new AccessDeniedException("Access is denied"),
                        403, "FORBIDDEN", "Access is denied"),
                Arguments.of(new RuntimeException(SENSITIVE, new SQLException(SENSITIVE)),
                        500, "INTERNAL_ERROR", "An unexpected error occurred"));
    }
}