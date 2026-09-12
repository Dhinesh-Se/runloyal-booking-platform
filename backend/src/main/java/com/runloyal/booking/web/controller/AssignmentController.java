package com.runloyal.booking.web.controller;

import com.runloyal.booking.service.StaffFeatureService;
import com.runloyal.booking.web.dto.response.StaffResponse;
import com.runloyal.booking.web.mapper.ApiMapper;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/services")
public class AssignmentController {
  private final StaffFeatureService service;
  private final ApiMapper mapper;

  public AssignmentController(StaffFeatureService service, ApiMapper mapper) {
    this.service = service;
    this.mapper = mapper;
  }

  @GetMapping("/{service}/staff")
  public List<StaffResponse> list(@PathVariable UUID service) {
    return this.service.assignedTo(service).stream().map(mapper::staff).toList();
  }

  @PostMapping("/{service}/staff/{staff}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void assign(@PathVariable UUID service, @PathVariable UUID staff) {
    this.service.assign(service, staff, true);
  }

  @DeleteMapping("/{service}/staff/{staff}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void unassign(@PathVariable UUID service, @PathVariable UUID staff) {
    this.service.assign(service, staff, false);
  }
}
