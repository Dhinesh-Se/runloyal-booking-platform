package com.runloyal.booking.web.dto;

import static org.junit.jupiter.api.Assertions.*;

import com.runloyal.booking.domain.Model;
import com.runloyal.booking.web.dto.request.AvailabilityCommand;
import com.runloyal.booking.web.dto.request.BookingCommand;
import com.runloyal.booking.web.dto.request.ServiceCommand;
import com.runloyal.booking.web.dto.request.StaffCommand;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.lang.annotation.Annotation;
import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalTime;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class RequestValidationTest {
    private static final UUID SERVICE_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID STAFF_ID = UUID.fromString("00000000-0000-0000-0000-000000000002");
    private static final Instant START = Instant.parse("2026-01-05T10:00:00Z");
    private static ValidatorFactory factory;
    private static Validator validator;

    @BeforeAll
    static void createValidatorWithoutApplicationContextOrDatabase() {
        factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    @AfterAll
    static void closeValidator() {
        if (factory != null) factory.close();
    }

    @Test
    void allExactTextLengthLimitsAreAccepted() {
        assertValid(new ServiceCommand("n".repeat(120), "d".repeat(1000), "c".repeat(80), 30, BigDecimal.ZERO, null));
        assertValid(new StaffCommand("s".repeat(120), null));
        assertValid(new BookingCommand(SERVICE_ID, STAFF_ID, START, "c".repeat(120), "p".repeat(120)));
    }

    @Test
    void serviceNameRejects121Characters() {
        assertInvalid(new ServiceCommand("n".repeat(121), "Description", "Care", 30, BigDecimal.ZERO, null), "name", Size.class);
    }

    @Test
    void serviceDescriptionRejects1001Characters() {
        assertInvalid(new ServiceCommand("Bath", "d".repeat(1001), "Care", 30, BigDecimal.ZERO, null), "description", Size.class);
    }

    @Test
    void serviceCategoryRejects81Characters() {
        assertInvalid(new ServiceCommand("Bath", "Description", "c".repeat(81), 30, BigDecimal.ZERO, null), "category", Size.class);
    }

    @Test
    void staffNameRejects121Characters() {
        assertInvalid(new StaffCommand("s".repeat(121), Model.Status.ACTIVE), "name", Size.class);
    }

    @Test
    void bookingCustomerAndPetNamesIndependentlyReject121Characters() {
        assertInvalid(new BookingCommand(SERVICE_ID, STAFF_ID, START, "c".repeat(121), "Pet"), "customerName", Size.class);
        assertInvalid(new BookingCommand(SERVICE_ID, STAFF_ID, START, "Customer", "p".repeat(121)), "petName", Size.class);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", "\t\n"})
    void requiredNamesAndCategoryRejectNullEmptyAndWhitespace(String blank) {
        assertInvalid(new ServiceCommand(blank, null, "Care", 30, BigDecimal.ZERO, null), "name", NotBlank.class);
        assertInvalid(new ServiceCommand("Bath", null, blank, 30, BigDecimal.ZERO, null), "category", NotBlank.class);
        assertInvalid(new StaffCommand(blank, null), "name", NotBlank.class);
        assertInvalid(new BookingCommand(SERVICE_ID, STAFF_ID, START, blank, null), "customerName", NotBlank.class);
    }

    @ParameterizedTest
    @NullAndEmptySource
    void descriptionAndPetNameAreOptional(String optional) {
        assertValid(new ServiceCommand("Bath", optional, "Care", 30, BigDecimal.ZERO, null));
        assertValid(new BookingCommand(SERVICE_ID, STAFF_ID, START, "Customer", optional));
    }

    @ParameterizedTest
    @ValueSource(strings = {"0", "0.00", "0.01", "1.2", "9999999999", "9999999999.99"})
    void priceAcceptsZeroAndValuesUpToExactTenIntegerTwoFractionDigitLimit(String price) {
        assertValid(service(30, new BigDecimal(price)));
    }

    @ParameterizedTest
    @ValueSource(strings = {"10000000000", "10000000000.00", "12345678901.23", "1E+10"})
    void priceRejectsMoreThanTenIntegerDigits(String price) {
        assertInvalid(service(30, new BigDecimal(price)), "price", Digits.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"0.001", "1.234", "9999999999.999"})
    void priceRejectsMoreThanTwoFractionDigits(String price) {
        assertInvalid(service(30, new BigDecimal(price)), "price", Digits.class);
    }

    @Test
    void priceDigitsMetadataMatchesDecimalTwelveTwoStorage() {
        var price = validator.getConstraintsForClass(ServiceCommand.class).getConstraintsForProperty("price");
        assertNotNull(price);
        var digits = price.getConstraintDescriptors().stream()
                .map(descriptor -> descriptor.getAnnotation())
                .filter(Digits.class::isInstance).map(Digits.class::cast).findFirst().orElseThrow();
        assertEquals(10, digits.integer());
        assertEquals(2, digits.fraction());
    }

    @Test
    void priceIsRequiredAndCannotBeNegative() {
        assertInvalid(service(30, null), "price", NotNull.class);
        assertInvalid(service(30, new BigDecimal("-0.01")), "price", DecimalMin.class);
    }

    @ParameterizedTest
    @ValueSource(ints = {1, 30, 60, 1441, 525600, Integer.MAX_VALUE})
    void durationAcceptsEveryPositiveIntWithoutAnArbitraryUpperBound(int duration) {
        assertValid(service(duration, BigDecimal.ZERO));
    }

    @ParameterizedTest
    @ValueSource(ints = {0, -1, Integer.MIN_VALUE})
    void durationRejectsZeroAndNegativeValues(int duration) {
        assertInvalid(service(duration, BigDecimal.ZERO), "durationMinutes", Positive.class);
    }

    @Test
    void bookingRequiresBothResourceIdsAndStartInstant() {
        assertInvalid(new BookingCommand(null, STAFF_ID, START, "Customer", null), "serviceId", NotNull.class);
        assertInvalid(new BookingCommand(SERVICE_ID, null, START, "Customer", null), "staffId", NotNull.class);
        assertInvalid(new BookingCommand(SERVICE_ID, STAFF_ID, null, "Customer", null), "startAt", NotNull.class);
    }

    @Test
    void bookingInstantDoesNotHaveAnUnspecifiedFutureOrHalfHourValidationConstraint() {
        assertValid(new BookingCommand(SERVICE_ID, STAFF_ID, Instant.EPOCH.plusNanos(1), "Customer", null));
    }

    @Test
    void availabilityRequiresDayBothTimesAndType() {
        assertInvalid(new AvailabilityCommand(null, LocalTime.of(9, 0), LocalTime.of(17, 0), Model.AvailabilityType.WORKING), "dayOfWeek", NotNull.class);
        assertInvalid(new AvailabilityCommand(DayOfWeek.MONDAY, null, LocalTime.of(17, 0), Model.AvailabilityType.WORKING), "startTime", NotNull.class);
        assertInvalid(new AvailabilityCommand(DayOfWeek.MONDAY, LocalTime.of(9, 0), null, Model.AvailabilityType.WORKING), "endTime", NotNull.class);
        assertInvalid(new AvailabilityCommand(DayOfWeek.MONDAY, LocalTime.of(9, 0), LocalTime.of(17, 0), null), "type", NotNull.class);
    }

    @Test
    void availabilityAcceptsEveryWeekdayAndType() {
        for (var day : DayOfWeek.values()) {
            for (var type : Model.AvailabilityType.values()) {
                assertValid(new AvailabilityCommand(day, LocalTime.MIN, LocalTime.of(23, 59), type));
            }
        }
    }

    @Test
    void explicitActiveAndInactiveStatusesAreAccepted() {
        for (var status : Model.Status.values()) {
            assertValid(new StaffCommand("Alex", status));
            assertValid(new ServiceCommand("Bath", null, "Care", 30, BigDecimal.ZERO, status));
        }
    }

    private static ServiceCommand service(int duration, BigDecimal price) {
        return new ServiceCommand("Bath", "Description", "Care", duration, price, Model.Status.ACTIVE);
    }

    private static <T> void assertValid(T request) {
        var violations = validator.validate(request);
        assertTrue(violations.isEmpty(), () -> "Unexpected constraints: " + violations);
    }

    private static <T> void assertInvalid(T request, String property, Class<? extends Annotation> constraint) {
        var violations = validator.validate(request);
        assertEquals(Set.of(property), violations.stream().map(violation -> violation.getPropertyPath().toString()).collect(Collectors.toSet()));
        assertTrue(violations.stream().anyMatch(violation -> violation.getConstraintDescriptor().getAnnotation().annotationType().equals(constraint)),
                () -> "Expected " + constraint.getSimpleName() + " for " + property + ": " + violations);
    }
}