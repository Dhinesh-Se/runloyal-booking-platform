package com.runloyal.booking.service;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.*;

import com.runloyal.booking.repo.ServiceRepository;
import com.runloyal.booking.security.TenantContext;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ServiceCatalogServiceTest {
    @Test
    void resourceLookupAlwaysUsesAuthenticatedTenant() {
        var context = mock(TenantContext.class);
        var services = mock(ServiceRepository.class);
        var tenant = UUID.randomUUID();
        var serviceId = UUID.randomUUID();
        when(context.tenantId()).thenReturn(tenant);
        when(services.findByIdAndTenantId(serviceId, tenant)).thenReturn(Optional.empty());

        var service = new ServiceCatalogService(context, services);

        assertThrows(RuntimeException.class, () -> service.find(serviceId));
        verify(services).findByIdAndTenantId(serviceId, tenant);
        verify(services, never()).findById(serviceId);
    }
}