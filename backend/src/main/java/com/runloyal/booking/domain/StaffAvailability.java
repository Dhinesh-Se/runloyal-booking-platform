package com.runloyal.booking.domain;

import jakarta.persistence.*;
import java.time.*;
import java.util.*;

@Entity
@Table(name = "staff_availability")
public class StaffAvailability {
  @Id public UUID id = UUID.randomUUID();

  @Column(name = "tenant_id")
  public UUID tenantId;

  @Column(name = "staff_id")
  public UUID staffId;

  @Column(name = "day_of_week")
  public DayOfWeek dayOfWeek;

  @Column(name = "start_time")
  public LocalTime startTime;

  @Column(name = "end_time")
  public LocalTime endTime;

  @Enumerated(EnumType.STRING)
  public Model.AvailabilityType type;
}
