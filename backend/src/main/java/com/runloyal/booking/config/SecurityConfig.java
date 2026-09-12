package com.runloyal.booking.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.runloyal.booking.web.dto.response.ApiError;
import java.time.Instant;
import java.util.Map;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
public class SecurityConfig {
    @Bean
    SecurityFilterChain security(HttpSecurity http, ObjectMapper objectMapper) throws Exception {
        return http.csrf(csrf -> csrf.disable())
                .authorizeHttpRequests(
                        authorize -> authorize
                                .requestMatchers("/swagger-ui/**", "/v3/api-docs/**", "/actuator/health")
                                .permitAll()
                                .anyRequest()
                                .authenticated())
                .exceptionHandling(
                        exceptions -> exceptions
                                .authenticationEntryPoint(
                                        (request, response, exception) -> writeError(objectMapper, request, response,
                                                401, "UNAUTHORIZED"))
                                .accessDeniedHandler(
                                        (request, response, exception) -> writeError(objectMapper, request, response,
                                                403, "FORBIDDEN")))
                .oauth2ResourceServer(oauth2 -> oauth2.jwt(Customizer.withDefaults()))
                .build();
    }

    private void writeError(
            ObjectMapper objectMapper,
            HttpServletRequest request,
            HttpServletResponse response,
            int status,
            String code)
            throws java.io.IOException {
        response.setStatus(status);
        response.setContentType("application/json");
        objectMapper.writeValue(
                response.getOutputStream(),
                new ApiError(
                        Instant.now(),
                        status,
                        code,
                        status == 401 ? "Authentication is required" : "Access is denied",
                        request.getRequestURI(),
                        Map.of()));
    }
}
