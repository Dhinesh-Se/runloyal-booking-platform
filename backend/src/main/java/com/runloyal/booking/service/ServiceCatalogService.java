package com.runloyal.booking.service;

import com.runloyal.booking.domain.Model;
import com.runloyal.booking.domain.ServiceOffering;
import com.runloyal.booking.repo.ServiceRepository;
import com.runloyal.booking.security.TenantContext;
import com.runloyal.booking.web.dto.request.ServiceCommand;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ServiceCatalogService {
    private final TenantContext context;
    private final ServiceRepository services;

    public ServiceCatalogService(TenantContext context, ServiceRepository services) {
        this.context = context;
        this.services = services;
    }

    public List<ServiceOffering> list() {
        return services.findByTenantId(context.tenantId());
    }

    @Transactional
    public ServiceOffering save(ServiceCommand command, UUID id) {
        context.requireAdmin();
        var tenant = context.tenantId();
        ServiceOffering service = id == null ? new ServiceOffering() : find(id);
        if (id == null)
            service.tenantId = tenant;
        service.name = command.name();
        service.description = command.description();
        service.category = command.category();
        service.durationMinutes = command.durationMinutes();
        service.price = command.price();
        service.status = command.status() == null ? Model.Status.ACTIVE : command.status();
        return services.save(service);
    }

    @Transactional
    public void delete(UUID id) {
        context.requireAdmin();
        var service = find(id);
        service.status = Model.Status.INACTIVE;
        services.save(service);
    }

    public ServiceOffering find(UUID id) {
        return services
                .findByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> new java.util.NoSuchElementException("Resource not found"));
    }
}
