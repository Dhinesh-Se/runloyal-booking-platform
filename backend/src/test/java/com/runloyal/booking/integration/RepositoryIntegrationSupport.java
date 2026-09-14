package com.runloyal.booking.integration;

import com.runloyal.booking.domain.AppUser;
import com.runloyal.booking.domain.Booking;
import com.runloyal.booking.domain.Model;
import com.runloyal.booking.domain.ServiceOffering;
import com.runloyal.booking.domain.Staff;
import com.runloyal.booking.domain.StaffAvailability;
import com.runloyal.booking.domain.StaffService;
import com.runloyal.booking.domain.Tenant;
import com.runloyal.booking.repo.AssignmentRepository;
import com.runloyal.booking.repo.AvailabilityRepository;
import com.runloyal.booking.repo.BookingRepository;
import com.runloyal.booking.repo.ServiceRepository;
import com.runloyal.booking.repo.StaffRepository;
import com.runloyal.booking.repo.TenantRepository;
import com.runloyal.booking.repo.UserRepository;
import com.runloyal.booking.web.dto.request.AvailabilityCommand;
import com.runloyal.booking.web.dto.request.BookingCommand;
import com.runloyal.booking.web.dto.request.ServiceCommand;
import com.runloyal.booking.web.dto.request.StaffCommand;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import java.util.function.Supplier;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Repository-only fixtures, committed before application calls. No outer test transaction,
 * database-wide cleanup, seed-data IDs, or dependency on another test's rows.
 * Concrete suites must bind their entire datasource configuration to disposable storage.
 */
abstract class RepositoryIntegrationSupport {
    static final Instant START = Instant.parse("2030-01-07T10:00:00Z");

    @Autowired TenantRepository tenants;
    @Autowired UserRepository users;
    @Autowired ServiceRepository services;
    @Autowired StaffRepository staffs;
    @Autowired AssignmentRepository assignments;
    @Autowired AvailabilityRepository availabilities;
    @Autowired BookingRepository bookings;
    @Autowired DataSource dataSource;

    Fixture local;
    Fixture foreign;

    protected abstract String expectedJdbcUrl();

    @BeforeEach
    void seedTenants() throws Exception {
        assertThat(TransactionSynchronizationManager.isActualTransactionActive())
                .as("An outer test transaction would hide application isolation/commit behavior")
                .isFalse();
        // Fail before any seeding if a future test configuration accidentally selects another DB.
        // Dynamic properties are the primary safety boundary; this check is defense in depth.
        try (var connection = dataSource.getConnection()) {
            assertThat(databaseEndpoint(connection.getMetaData().getURL()))
                    .isEqualTo(databaseEndpoint(expectedJdbcUrl()));
        }
        local = seedFixture();
        foreign = seedFixture();
    }

    @AfterEach
    void clearAuthentication() {
        SecurityContextHolder.clearContext();
    }

    private static String databaseEndpoint(String url) {
        return url.split("[?;]", 2)[0];
    }

    private Fixture seedFixture() {
        var tenant = new Tenant();
        tenant.name = "integration-" + UUID.randomUUID();
        tenant.timezone = "UTC";
        tenant = tenants.saveAndFlush(tenant);

        var admin = member(tenant, Model.Role.TENANT_ADMIN, Model.Status.ACTIVE);
        var reader = member(tenant, Model.Role.STAFF, Model.Status.ACTIVE);
        var inactive = member(tenant, Model.Role.TENANT_ADMIN, Model.Status.INACTIVE);

        var service = new ServiceOffering();
        service.tenantId = tenant.id;
        service.name = "Grooming";
        service.description = "Disposable integration fixture";
        service.category = "Grooming";
        service.durationMinutes = 60;
        service.price = new BigDecimal("50.00");
        service.status = Model.Status.ACTIVE;
        service = services.saveAndFlush(service);

        var staff = new Staff();
        staff.tenantId = tenant.id;
        staff.userId = null;
        staff.name = "Fixture staff";
        staff.status = Model.Status.ACTIVE;
        staff = staffs.saveAndFlush(staff);

        var assignment = new StaffService();
        assignment.tenantId = tenant.id;
        assignment.staffId = staff.id;
        assignment.serviceId = service.id;
        assignments.saveAndFlush(assignment);

        var working = new StaffAvailability();
        working.tenantId = tenant.id;
        working.staffId = staff.id;
        working.dayOfWeek = START.atZone(ZoneOffset.UTC).getDayOfWeek();
        working.startTime = LocalTime.of(8, 0);
        working.endTime = LocalTime.of(18, 0);
        working.type = Model.AvailabilityType.WORKING;
        working = availabilities.saveAndFlush(working);
        return new Fixture(tenant, admin, reader, inactive, service, staff, working);
    }

    private AppUser member(Tenant tenant, Model.Role role, Model.Status status) {
        var user = new AppUser();
        user.tenantId = tenant.id;
        user.oktaSubject = "integration-" + UUID.randomUUID();
        user.role = role;
        user.status = status;
        return users.saveAndFlush(user);
    }

    static BookingCommand command(Fixture fixture, Instant start) {
        return new BookingCommand(fixture.service().id, fixture.staff().id, start, "Customer", "Pet");
    }

    static AvailabilityCommand workingCommand() {
        return new AvailabilityCommand(START.atZone(ZoneOffset.UTC).getDayOfWeek(),
                LocalTime.of(8, 0), LocalTime.of(18, 0), Model.AvailabilityType.WORKING);
    }

    static ServiceCommand serviceCommand() {
        return new ServiceCommand("Updated service", "Description", "Grooming", 60,
                new BigDecimal("50.00"), Model.Status.ACTIVE);
    }

    static StaffCommand staffCommand() {
        return new StaffCommand("Updated Staff", Model.Status.ACTIVE);
    }

    static Booking bookingRow(Fixture fixture, Instant start) {
        var booking = new Booking();
        booking.tenantId = fixture.tenant().id;
        booking.serviceId = fixture.service().id;
        booking.staffId = fixture.staff().id;
        booking.startAt = start;
        booking.endAt = start.plusSeconds(3600);
        booking.status = Model.BookingStatus.CONFIRMED;
        booking.customerName = "Fixture customer";
        booking.petName = "Fixture pet";
        return booking;
    }

    static Jwt token(String value, String subject) {
        var now = Instant.now();
        return Jwt.withTokenValue(value)
                .header("alg", "RS256")
                .issuer("https://example.okta.com/oauth2/default")
                .audience(List.of("api://default"))
                .subject(subject)
                .issuedAt(now.minusSeconds(30))
                .expiresAt(now.plusSeconds(300))
                .claim("scp", List.of("booking.read", "booking.write"))
                .build();
    }

    /** Service-level authentication only; real TenantContext still queries active DB membership. */
    static <T> T as(AppUser user, Supplier<T> action) {
        var previous = SecurityContextHolder.getContext();
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(new JwtAuthenticationToken(token("service-test-token", user.oktaSubject), List.of()));
        SecurityContextHolder.setContext(context);
        try {
            return action.get();
        } finally {
            SecurityContextHolder.setContext(previous);
        }
    }

    record Fixture(Tenant tenant, AppUser admin, AppUser member, AppUser inactive,
            ServiceOffering service, Staff staff, StaffAvailability working) {}
}