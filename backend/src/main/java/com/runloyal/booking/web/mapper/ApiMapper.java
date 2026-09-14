package com.runloyal.booking.web.mapper;

import com.runloyal.booking.domain.*;
import com.runloyal.booking.web.dto.response.*;
import org.springframework.stereotype.Component;

@Component
public class ApiMapper {
  public ServiceResponse service(ServiceOffering value) {
    return new ServiceResponse(
        value.id,
        value.tenantId,
        value.name,
        value.description,
        value.category,
        value.durationMinutes,
        value.price,
        value.status);
  }

  public StaffResponse staff(Staff value) {
    return new StaffResponse(value.id, value.tenantId, value.userId, value.name, value.status);
  }

  public AvailabilityResponse availability(StaffAvailability value) {
    return new AvailabilityResponse(
        value.id,
        value.tenantId,
        value.staffId,
        value.dayOfWeek,
        value.startTime,
        value.endTime,
        value.type);
  }

  public BookingResponse booking(Booking value) {
    return new BookingResponse(
        value.id,
        value.tenantId,
        value.serviceId,
        value.staffId,
        value.startAt,
        value.endAt,
        value.status,
        value.customerName,
        value.petName);
  }

  public UnavailabilityResponse unavailability(StaffUnavailability value) {
    return new UnavailabilityResponse(value.id, value.tenantId, value.staffId, value.startAt, value.endAt, value.reason);
  }
}
