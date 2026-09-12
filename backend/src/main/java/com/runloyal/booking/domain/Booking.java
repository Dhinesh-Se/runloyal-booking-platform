package com.runloyal.booking.domain;

import jakarta.persistence.*;
import java.time.*;
import java.util.*;

@Entity
@Table(name = "bookings")
public class Booking {
  @Id public UUID id = UUID.randomUUID();

  @Column(name = "tenant_id")
  public UUID tenantId;

  @Column(name = "service_id")
  public UUID serviceId;

  @Column(name = "staff_id")
  public UUID staffId;

  @Column(name = "start_at")
  public Instant startAt;

  @Column(name = "end_at")
  public Instant endAt;

  @Enumerated(EnumType.STRING)
  public Model.BookingStatus status;

  @Column(name = "customer_name")
  public String customerName;

  @Column(name = "pet_name")
  public String petName;
}
