package com.runloyal.booking.common.exception;

import com.runloyal.booking.security.TenantContext;
import com.runloyal.booking.web.dto.response.ApiError;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.NoSuchElementException;
import org.springframework.dao.ConcurrencyFailureException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@RestControllerAdvice
public class Errors {
    private ApiError error(
            HttpStatus status, String code, String message, HttpServletRequest request) {
        return new ApiError(
                Instant.now(), status.value(), code, message, request.getRequestURI(), Map.of());
    }

    @ExceptionHandler({ NoSuchElementException.class, ResourceNotFoundException.class })
    @ResponseStatus(HttpStatus.NOT_FOUND)
    ApiError notFound(Exception exception, HttpServletRequest request) {
        return error(HttpStatus.NOT_FOUND, "NOT_FOUND", exception.getMessage(), request);
    }

    @ExceptionHandler({ TenantContext.Forbidden.class, AccessDeniedException.class })
    @ResponseStatus(HttpStatus.FORBIDDEN)
    ApiError forbidden(Exception exception, HttpServletRequest request) {
        return error(HttpStatus.FORBIDDEN, "FORBIDDEN", exception.getMessage(), request);
    }

    @ExceptionHandler(ConflictException.class)
    @ResponseStatus(HttpStatus.CONFLICT)
    ApiError conflict(Exception exception, HttpServletRequest request) {
        return error(HttpStatus.CONFLICT, "CONFLICT", exception.getMessage(), request);
    }

    @ExceptionHandler({ DataIntegrityViolationException.class, ConcurrencyFailureException.class })
    @ResponseStatus(HttpStatus.CONFLICT)
    ApiError persistenceConflict(Exception exception, HttpServletRequest request) {
        // Database messages can contain SQL, constraint names and customer data.
        return error(HttpStatus.CONFLICT, "CONFLICT", "Request conflicts with the current resource state", request);
    }

    @ExceptionHandler({ IllegalArgumentException.class, IllegalStateException.class })
    @ResponseStatus(HttpStatus.UNPROCESSABLE_ENTITY)
    ApiError invalid(Exception exception, HttpServletRequest request) {
        return error(HttpStatus.UNPROCESSABLE_ENTITY, "INVALID", exception.getMessage(), request);
    }

    @ExceptionHandler({ HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class,
            MissingServletRequestParameterException.class })
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    ApiError badRequest(Exception exception, HttpServletRequest request) {
        // Do not echo rejected values, request bodies or parser/conversion diagnostics.
        return error(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "Request is malformed or contains invalid parameters", request);
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    ResponseEntity<ApiError> methodNotAllowed(
            HttpRequestMethodNotSupportedException exception, HttpServletRequest request) {
        return new ResponseEntity<>(
                error(HttpStatus.METHOD_NOT_ALLOWED, "METHOD_NOT_ALLOWED", "Request method is not supported", request),
                exception.getHeaders(), HttpStatus.METHOD_NOT_ALLOWED);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    ApiError validation(MethodArgumentNotValidException exception, HttpServletRequest request) {
        var errors = new LinkedHashMap<String, String>();
        exception
                .getBindingResult()
                .getFieldErrors()
                .forEach(field -> errors.put(field.getField(), field.getDefaultMessage()));
        return new ApiError(
                Instant.now(),
                400,
                "VALIDATION",
                "Request validation failed",
                request.getRequestURI(),
                errors);
    }

    @ExceptionHandler(Exception.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    ApiError unexpected(Exception exception, HttpServletRequest request) {
        return error(
                HttpStatus.INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "An unexpected error occurred",
                request);
    }
}
