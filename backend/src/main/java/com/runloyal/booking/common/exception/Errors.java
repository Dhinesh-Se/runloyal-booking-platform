package com.runloyal.booking.common.exception;

import com.runloyal.booking.security.TenantContext;
import com.runloyal.booking.web.dto.response.ApiError;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.NoSuchElementException;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

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

    @ExceptionHandler({ IllegalArgumentException.class, IllegalStateException.class })
    @ResponseStatus(HttpStatus.UNPROCESSABLE_ENTITY)
    ApiError invalid(Exception exception, HttpServletRequest request) {
        return error(HttpStatus.UNPROCESSABLE_ENTITY, "INVALID", exception.getMessage(), request);
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
