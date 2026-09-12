package com.runloyal.booking.security;

import com.runloyal.booking.domain.AppUser;
import com.runloyal.booking.domain.Model;
import com.runloyal.booking.repo.UserRepository;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
public class TenantContext {
    private final UserRepository users;

    public TenantContext(UserRepository users) {
        this.users = users;
    }

    public AppUser user() {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof Jwt jwt)) {
            throw new Forbidden("Authentication required");
        }
        return users.findByOktaSubject(jwt.getSubject())
                .filter(user -> user.status == Model.Status.ACTIVE)
                .orElseThrow(() -> new Forbidden("No active tenant membership"));
    }

    public UUID tenantId() {
        return user().tenantId;
    }

    public void requireAdmin() {
        if (user().role != Model.Role.TENANT_ADMIN) {
            throw new Forbidden("Tenant admin role required");
        }
    }

    public static class Forbidden extends RuntimeException {
        public Forbidden(String message) {
            super(message);
        }
    }
}
