package com.runloyal.booking.web.controller;

import com.runloyal.booking.service.ServiceCatalogService;
import com.runloyal.booking.web.dto.request.ServiceCommand;
import com.runloyal.booking.web.dto.response.ServiceResponse;
import com.runloyal.booking.web.mapper.ApiMapper;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/services")
public class ServiceController {
  private final ServiceCatalogService service;
  private final ApiMapper mapper;

  public ServiceController(ServiceCatalogService service, ApiMapper mapper) {
    this.service = service;
    this.mapper = mapper;
  }

  @GetMapping
  public List<ServiceResponse> list() {
    return service.list().stream().map(mapper::service).toList();
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  public ServiceResponse create(@Valid @RequestBody ServiceCommand command) {
    return mapper.service(service.save(command, null));
  }

  @PutMapping("/{id}")
  public ServiceResponse update(@PathVariable UUID id, @Valid @RequestBody ServiceCommand command) {
    return mapper.service(service.save(command, id));
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void delete(@PathVariable UUID id) {
    service.delete(id);
  }
}
