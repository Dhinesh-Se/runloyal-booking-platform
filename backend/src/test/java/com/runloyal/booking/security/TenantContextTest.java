package com.runloyal.booking.security;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.runloyal.booking.domain.AppUser;
import com.runloyal.booking.domain.Model;
import com.runloyal.booking.repo.Repos;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

class TenantContextTest {
  private final Repos.Users users = mock(Repos.Users.class);

  @AfterEach
  void clearAuthentication() {
    SecurityContextHolder.clearContext();
  }

  @Test
  void resolvesTenantOnlyFromActiveMembership() {
    UUID tenant = UUID.randomUUID();
    var user = new AppUser();
    user.tenantId = tenant;
    user.status = Model.Status.ACTIVE;
    when(users.findByOktaSubject("subject")).thenReturn(Optional.of(user));
    authenticate("subject");

    assertEquals(tenant, new TenantContext(users).tenantId());
  }

  @Test
  void rejectsInactiveMembership() {
    var user = new AppUser();
    user.status = Model.Status.INACTIVE;
    when(users.findByOktaSubject("subject")).thenReturn(Optional.of(user));
    authenticate("subject");

    assertThrows(TenantContext.Forbidden.class, () -> new TenantContext(users).tenantId());
  }

  private void authenticate(String subject) {
    Jwt jwt =
        new Jwt(
            "token",
            Instant.now(),
            Instant.now().plusSeconds(60),
            Map.of("alg", "none"),
            Map.of("sub", subject));
    SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt));
  }
}
