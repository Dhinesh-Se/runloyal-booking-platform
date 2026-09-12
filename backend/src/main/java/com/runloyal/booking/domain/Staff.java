package com.runloyal.booking.domain; import jakarta.persistence.*; import java.util.*;
@Entity @Table(name="staff") public class Staff { @Id public UUID id=UUID.randomUUID(); @Column(name="tenant_id",nullable=false) public UUID tenantId; @Column(name="user_id") public UUID userId; public String name; @Enumerated(EnumType.STRING) public Model.Status status; }
