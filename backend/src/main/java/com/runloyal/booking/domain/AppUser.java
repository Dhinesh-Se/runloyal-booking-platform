package com.runloyal.booking.domain;

import jakarta.persistence.*;
import java.util.*;

@Entity
@Table(name = "users")
public class AppUser {
  @Id public UUID id = UUID.randomUUID();

  @Column(name = "tenant_id", nullable = false)
  public UUID tenantId;

  @Column(name = "okta_subject", nullable = false, unique = true)
  public String oktaSubject;

  @Enumerated(EnumType.STRING)
  public Model.Role role;

  @Enumerated(EnumType.STRING)
  public Model.Status status;
}
