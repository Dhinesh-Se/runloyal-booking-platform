package com.runloyal.booking.web.controller;

import com.runloyal.booking.security.TenantContext;
import com.runloyal.booking.repo.TenantRepository;
import com.runloyal.booking.web.dto.response.UserResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class MeController {
    private final TenantContext context;
    private final TenantRepository tenants;

    public MeController(TenantContext context, TenantRepository tenants) {
        this.context = context;
        this.tenants = tenants;
    }

    @GetMapping("/me")
    public UserResponse me() {
        var user = context.user();
        var tenant = tenants.findById(user.tenantId)
                .orElseThrow(() -> new IllegalStateException("Tenant membership is invalid"));
        return new UserResponse(user.id, user.tenantId, tenant.name, tenant.timezone,
                user.oktaSubject, user.role, user.status);
    }
}
