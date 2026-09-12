package com.runloyal.booking.web.controller;

import com.runloyal.booking.service.BookingFeatureService;
import com.runloyal.booking.web.dto.request.BookingCommand;
import com.runloyal.booking.web.dto.response.*;
import com.runloyal.booking.web.mapper.ApiMapper;
import jakarta.validation.Valid;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class BookingController {
  private final BookingFeatureService service;
  private final ApiMapper mapper;

  public BookingController(BookingFeatureService service, ApiMapper mapper) {
    this.service = service;
    this.mapper = mapper;
  }

  @GetMapping("/services/{service}/available-staff")
  public List<StaffResponse> available(
      @PathVariable("service") UUID serviceId, @RequestParam Instant startAt) {
    return service.available(serviceId, startAt).stream().map(mapper::staff).toList();
  }

  @GetMapping("/bookings")
  public List<BookingResponse> calendar(@RequestParam Instant from, @RequestParam Instant to) {
    return service.calendar(from, to).stream().map(mapper::booking).toList();
  }

  @PostMapping("/bookings")
  @ResponseStatus(HttpStatus.CREATED)
  public BookingResponse create(@Valid @RequestBody BookingCommand command) {
    return mapper.booking(service.book(command));
  }

  @GetMapping("/bookings/{id}")
  public BookingResponse get(@PathVariable UUID id) {
    return mapper.booking(service.findBooking(id));
  }

  @PostMapping("/bookings/{id}/cancel")
  public BookingResponse cancel(@PathVariable UUID id) {
    return mapper.booking(service.cancel(id));
  }
}
