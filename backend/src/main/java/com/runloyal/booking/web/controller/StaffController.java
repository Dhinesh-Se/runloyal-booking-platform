package com.runloyal.booking.web.controller;

import com.runloyal.booking.service.StaffFeatureService;
import com.runloyal.booking.web.dto.request.StaffCommand;
import com.runloyal.booking.web.dto.response.StaffResponse;
import com.runloyal.booking.web.mapper.ApiMapper;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/staff")
public class StaffController {
  private final StaffFeatureService service;
  private final ApiMapper mapper;

  public StaffController(StaffFeatureService service, ApiMapper mapper) {
    this.service = service;
    this.mapper = mapper;
  }

  @GetMapping
  public List<StaffResponse> list() {
    return service.list().stream().map(mapper::staff).toList();
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  public StaffResponse create(@Valid @RequestBody StaffCommand command) {
    return mapper.staff(service.save(command, null));
  }

  @PutMapping("/{id}")
  public StaffResponse update(@PathVariable UUID id, @Valid @RequestBody StaffCommand command) {
    return mapper.staff(service.save(command, id));
  }
}
