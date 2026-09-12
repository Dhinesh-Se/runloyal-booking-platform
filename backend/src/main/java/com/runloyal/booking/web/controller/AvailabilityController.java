package com.runloyal.booking.web.controller;

import com.runloyal.booking.service.StaffFeatureService;
import com.runloyal.booking.web.dto.request.AvailabilityCommand;
import com.runloyal.booking.web.dto.response.AvailabilityResponse;
import com.runloyal.booking.web.mapper.ApiMapper;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/staff/{staff}/availability")
public class AvailabilityController {
  private final StaffFeatureService service;
  private final ApiMapper mapper;

  public AvailabilityController(StaffFeatureService service, ApiMapper mapper) {
    this.service = service;
    this.mapper = mapper;
  }

  @GetMapping
  public List<AvailabilityResponse> list(@PathVariable UUID staff) {
    return service.availability(staff).stream().map(mapper::availability).toList();
  }

  @PostMapping
  public AvailabilityResponse create(
      @PathVariable UUID staff, @Valid @RequestBody AvailabilityCommand command) {
    return mapper.availability(service.saveAvailability(staff, command, null));
  }

  @PutMapping("/{id}")
  public AvailabilityResponse update(
      @PathVariable UUID staff,
      @PathVariable UUID id,
      @Valid @RequestBody AvailabilityCommand command) {
    return mapper.availability(service.saveAvailability(staff, command, id));
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void delete(@PathVariable UUID id) {
    service.deleteAvailability(id);
  }
}
