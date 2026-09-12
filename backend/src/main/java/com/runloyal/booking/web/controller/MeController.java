package com.runloyal.booking.web.controller;

import com.runloyal.booking.security.TenantContext;
import com.runloyal.booking.web.dto.response.UserResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class MeController {
  private final TenantContext context;

  public MeController(TenantContext context) {
    this.context = context;
  }

  @GetMapping("/me")
  public UserResponse me() {
    var user = context.user();
    return new UserResponse(user.id, user.tenantId, user.oktaSubject, user.role, user.status);
  }
}
