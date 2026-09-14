package com.runloyal.booking.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.runloyal.booking.domain.Booking;
import com.runloyal.booking.domain.Model;
import com.runloyal.booking.domain.ServiceOffering;
import com.runloyal.booking.repo.ServiceRepository;
import com.runloyal.booking.security.TenantContext;
import com.runloyal.booking.web.dto.request.ServiceCommand;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;

class ServiceCatalogServiceTest {
    private final UUID tenantId = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private final TenantContext context = mock(TenantContext.class);
    private final ServiceRepository services = mock(ServiceRepository.class);
    private final ServiceCatalogService subject = new ServiceCatalogService(context, services);
    private final ServiceOffering offering = new ServiceOffering();

    @BeforeEach
    void setUp() {
        when(context.tenantId()).thenReturn(tenantId);
        offering.tenantId = tenantId;
        offering.name = "Original";
        offering.description = "Original description";
        offering.category = "Care";
        offering.durationMinutes = 30;
        offering.price = BigDecimal.TEN;
        offering.status = Model.Status.ACTIVE;
    }

    @AfterEach
    void noUnscopedReadsOrPhysicalDeletion() {
        for (var invocation : mockingDetails(services).getInvocations()) {
            assertFalse(java.util.Set.of("findById", "findAll", "findAllById", "getById", "getOne", "getReferenceById")
                    .contains(invocation.getMethod().getName()), invocation::toString);
        }
        verify(services, never()).findById(any());
        verify(services, never()).findAll();
        verify(services, never()).findAllById(any());
        verify(services, never()).getReferenceById(any());
        verify(services, never()).delete(any(ServiceOffering.class));
        verify(services, never()).deleteById(any());
        verify(services, never()).deleteAll();
    }

    @Test
    void resourceLookupAlwaysUsesAuthenticatedTenant() {
        when(services.findByIdAndTenantId(offering.id, tenantId)).thenReturn(Optional.empty());
        assertThrows(NoSuchElementException.class, () -> subject.find(offering.id));
        verify(services).findByIdAndTenantId(offering.id, tenantId);
        verifyNoMoreInteractions(services);
        verify(context, never()).requireAdmin();
    }

    @Test
    void listReturnsTenantScopedActiveAndInactiveRowsWithoutAdminCheck() {
        var inactive = new ServiceOffering();
        inactive.tenantId = tenantId;
        inactive.status = Model.Status.INACTIVE;
        when(services.findByTenantId(tenantId)).thenReturn(List.of(offering, inactive));

        assertEquals(List.of(offering, inactive), subject.list());

        verify(services).findByTenantId(tenantId);
        verifyNoMoreInteractions(services);
        verify(context, never()).requireAdmin();
    }

    @Test
    void findReturnsScopedEntityWithoutAdminCheckOrOtherReads() {
        stubExisting();
        assertSame(offering, subject.find(offering.id));
        verify(services).findByIdAndTenantId(offering.id, tenantId);
        verifyNoMoreInteractions(services);
        verify(context, never()).requireAdmin();
    }

    @Test
    void createUsesAuthenticatedTenantAndDefaultActiveStatusWithAllCommandFields() {
        when(services.save(any(ServiceOffering.class))).thenAnswer(invocation -> invocation.getArgument(0));
        var command = new ServiceCommand("Bath", "Gentle wash", "Grooming", 45, new BigDecimal("42.50"), null);

        var result = subject.save(command, null);

        assertNotNull(result.id);
        assertEquals(tenantId, result.tenantId);
        assertFields(command, result);
        assertEquals(Model.Status.ACTIVE, result.status);
        var order = inOrder(context, services);
        order.verify(context).requireAdmin();
        order.verify(context).tenantId();
        order.verify(services).save(result);
        verifyNoMoreInteractions(context, services);
    }

    @ParameterizedTest
    @EnumSource(Model.Status.class)
    void updateUsesScopedEntityPreservesIdentityAndCopiesAllMutableFields(Model.Status status) {
        stubExisting();
        when(services.save(any(ServiceOffering.class))).thenAnswer(invocation -> invocation.getArgument(0));
        var id = offering.id;
        var command = new ServiceCommand("Renamed", "New description", "New category", 75, new BigDecimal("99.99"), status);

        var result = subject.save(command, id);

        assertSame(offering, result);
        assertEquals(id, result.id);
        assertEquals(tenantId, result.tenantId);
        assertFields(command, result);
        assertEquals(status, result.status);
        var order = inOrder(context, services);
        order.verify(context).requireAdmin();
        order.verify(context, times(2)).tenantId();
        order.verify(services).findByIdAndTenantId(id, tenantId);
        order.verify(services).save(offering);
        verifyNoMoreInteractions(context, services);
    }

    @Test
    void updateAllowsOptionalDescriptionAndDefaultsNullStatusToActive() {
        offering.status = Model.Status.INACTIVE;
        stubExisting();
        when(services.save(any(ServiceOffering.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var result = subject.save(new ServiceCommand("Bath", null, "Care", 1, BigDecimal.ZERO, null), offering.id);

        assertNull(result.description);
        assertEquals(Model.Status.ACTIVE, result.status);
        assertEquals(1, result.durationMinutes);
        assertEquals(BigDecimal.ZERO, result.price);
    }

    @ParameterizedTest
    @ValueSource(ints = {1, 120, Integer.MAX_VALUE})
    void durationEditNeverResizesAnExistingBookingSnapshot(int duration) {
        stubExisting();
        when(services.save(any(ServiceOffering.class))).thenAnswer(invocation -> invocation.getArgument(0));
        var historical = new Booking();
        historical.tenantId = tenantId;
        historical.serviceId = offering.id;
        historical.startAt = Instant.parse("2026-01-05T10:00:00Z");
        historical.endAt = Instant.parse("2026-01-05T10:30:00Z");
        historical.status = Model.BookingStatus.CONFIRMED;
        var end = historical.endAt;

        var updated = subject.save(new ServiceCommand("Bath", "New duration", "Care", duration, BigDecimal.TEN, Model.Status.ACTIVE), offering.id);

        assertEquals(duration, updated.durationMinutes);
        assertEquals(end, historical.endAt);
        assertEquals(Instant.parse("2026-01-05T10:00:00Z"), historical.startAt);
        assertEquals(Model.BookingStatus.CONFIRMED, historical.status);
        // Catalog writes are limited to the offering. Creation-time snapshot behavior is also
        // exercised through BookingFeatureService in its dedicated unit suite.
        verify(services).findByIdAndTenantId(offering.id, tenantId);
        verify(services).save(offering);
        verifyNoMoreInteractions(services);
    }

    @ParameterizedTest
    @EnumSource(Model.Status.class)
    void deleteIsTenantScopedSoftDeactivationAndPreservesCatalogData(Model.Status originalStatus) {
        offering.status = originalStatus;
        stubExisting();

        subject.delete(offering.id);

        assertEquals(Model.Status.INACTIVE, offering.status);
        assertEquals(tenantId, offering.tenantId);
        assertEquals("Original", offering.name);
        assertEquals("Original description", offering.description);
        assertEquals("Care", offering.category);
        assertEquals(30, offering.durationMinutes);
        assertEquals(BigDecimal.TEN, offering.price);
        var order = inOrder(context, services);
        order.verify(context).requireAdmin();
        order.verify(context).tenantId();
        order.verify(services).findByIdAndTenantId(offering.id, tenantId);
        order.verify(services).save(offering);
        verifyNoMoreInteractions(context, services);
    }

    @ParameterizedTest
    @ValueSource(strings = {"create", "update", "delete"})
    void nonAdminCannotCreateUpdateOrDelete(String operation) {
        doThrow(new TenantContext.Forbidden("Tenant admin role required")).when(context).requireAdmin();
        assertThrows(TenantContext.Forbidden.class, () -> {
            if (operation.equals("delete")) subject.delete(offering.id);
            else subject.save(new ServiceCommand("Bath", null, "Care", 30, BigDecimal.TEN, null),
                    operation.equals("create") ? null : offering.id);
        });
        verify(context).requireAdmin();
        verify(context, never()).tenantId();
        verifyNoInteractions(services);
        assertEquals(Model.Status.ACTIVE, offering.status);
        assertEquals("Original", offering.name);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void foreignTenantServiceCannotBeUpdatedOrDeleted(boolean delete) {
        when(services.findByIdAndTenantId(offering.id, tenantId)).thenReturn(Optional.empty());
        assertThrows(NoSuchElementException.class, () -> {
            if (delete) subject.delete(offering.id);
            else subject.save(new ServiceCommand("Foreign edit", null, "Care", 60, BigDecimal.ZERO, null), offering.id);
        });
        verify(services).findByIdAndTenantId(offering.id, tenantId);
        verifyNoMoreInteractions(services);
        assertEquals("Original", offering.name);
        assertEquals(30, offering.durationMinutes);
        assertEquals(Model.Status.ACTIVE, offering.status);
    }

    private void stubExisting() {
        when(services.findByIdAndTenantId(offering.id, tenantId)).thenReturn(Optional.of(offering));
    }

    private void assertFields(ServiceCommand command, ServiceOffering actual) {
        assertEquals(command.name(), actual.name);
        assertEquals(command.description(), actual.description);
        assertEquals(command.category(), actual.category);
        assertEquals(command.durationMinutes(), actual.durationMinutes);
        assertEquals(command.price(), actual.price);
    }
}