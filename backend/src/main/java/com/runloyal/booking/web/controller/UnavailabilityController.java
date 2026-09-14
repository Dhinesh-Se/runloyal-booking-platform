package com.runloyal.booking.web.controller;

import com.runloyal.booking.service.StaffFeatureService;
import com.runloyal.booking.web.dto.request.UnavailabilityCommand;
import com.runloyal.booking.web.dto.response.UnavailabilityResponse;
import com.runloyal.booking.web.mapper.ApiMapper;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/staff/{staff}/unavailability")
public class UnavailabilityController {
    private final StaffFeatureService service;
    private final ApiMapper mapper;

    public UnavailabilityController(StaffFeatureService service, ApiMapper mapper) {
        this.service = service;
        this.mapper = mapper;
    }

    @GetMapping
    public List<UnavailabilityResponse> list(@PathVariable UUID staff) {
        return service.unavailability(staff).stream().map(mapper::unavailability).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public UnavailabilityResponse create(@PathVariable UUID staff, @Valid @RequestBody UnavailabilityCommand command) {
        return mapper.unavailability(service.saveUnavailability(staff, command, null));
    }

    @PutMapping("/{id}")
    public UnavailabilityResponse update(@PathVariable UUID staff, @PathVariable UUID id,
            @Valid @RequestBody UnavailabilityCommand command) {
        return mapper.unavailability(service.saveUnavailability(staff, command, id));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID staff, @PathVariable UUID id) {
        service.deleteUnavailability(staff, id);
    }
}
