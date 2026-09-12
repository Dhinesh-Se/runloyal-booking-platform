package com.runloyal.booking.domain;

import jakarta.persistence.*;
import java.util.*;

@Entity
@Table(name = "tenants")
public class Tenant {
    @Id
    public UUID id = UUID.randomUUID();
    @Column(nullable = false, unique = true)
    public String name;
    @Column(nullable = false)
    public String timezone;
}
