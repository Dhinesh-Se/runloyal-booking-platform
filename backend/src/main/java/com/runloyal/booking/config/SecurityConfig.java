package com.runloyal.booking.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.runloyal.booking.web.dto.response.ApiError;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.net.URI;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoders;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
public class SecurityConfig {
    @Value("${spring.security.oauth2.resourceserver.jwt.issuer-uri}")
    private String issuerUri;

    @Value("${spring.security.oauth2.resourceserver.jwt.audience}")
    private String audience;

    @Value("${app.cors.allowed-origins:http://localhost:3000}")
    private List<String> allowedOrigins;

    @Bean
    NimbusJwtDecoder jwtDecoder() {
        // Validate configuration before issuer discovery makes any external requests.
        OAuth2TokenValidator<Jwt> validator = jwtValidator(issuerUri, audience);
        NimbusJwtDecoder decoder = JwtDecoders.fromIssuerLocation(issuerUri);
        decoder.setJwtValidator(validator);
        return decoder;
    }

    static OAuth2TokenValidator<Jwt> jwtValidator(String issuerUri, String audience) {
        requireConfigured(issuerUri, "OKTA_ISSUER_URI");
        requireConfigured(audience, "OKTA_AUDIENCE");
        URI issuer;
        try {
            issuer = URI.create(issuerUri);
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("OKTA_ISSUER_URI must be a valid HTTPS custom authorization server URI");
        }
        // Custom domains are supported; org authorization servers cannot issue tokens
        // for this API.
        if (!"https".equalsIgnoreCase(issuer.getScheme())
                || issuer.getHost() == null
                || issuer.getRawUserInfo() != null
                || issuer.getRawQuery() != null
                || issuer.getRawFragment() != null
                || issuer.getPort() == 0
                || issuer.getPort() > 65535
                || issuer.getRawPath() == null
                || !issuer.getRawPath().matches("/oauth2/[A-Za-z0-9_-]+")) {
            throw new IllegalArgumentException(
                    "OKTA_ISSUER_URI must use HTTPS and /oauth2/{id}, without userinfo, query, fragment or trailing slash. "
                            + "Copy the Issuer URI from Okta Security > API > Authorization Servers, not the org URL.");
        }
        OAuth2TokenValidator<Jwt> issuerValidator = JwtValidators.createDefaultWithIssuer(issuerUri);
        OAuth2TokenValidator<Jwt> audienceValidator = jwt -> jwt.getAudience() != null
                && jwt.getAudience().contains(audience)
                        ? OAuth2TokenValidatorResult.success()
                        : OAuth2TokenValidatorResult.failure(new OAuth2Error(
                                "invalid_token", "The required audience is missing", null));
        OAuth2TokenValidator<Jwt> accessTokenValidator = jwt -> {
            // Okta access tokens contain scp; ID tokens are identity-only even if
            // an administrator mistakenly configures the API audience as a client ID.
            // Do not substitute uid/email claims for the signed access-token subject.
            Object scopes = jwt.getClaims().get("scp");
            boolean hasScopes = scopes instanceof List<?> values
                    && !values.isEmpty()
                    && values.stream().allMatch(scope -> scope instanceof String value && !value.isBlank());
            if (jwt.getExpiresAt() == null
                    || jwt.getSubject() == null
                    || jwt.getSubject().isBlank()
                    || !hasScopes) {
                return OAuth2TokenValidatorResult.failure(new OAuth2Error(
                        "invalid_token", "An expiring Okta access token with a subject and scopes is required", null));
            }
            return OAuth2TokenValidatorResult.success();
        };
        return new DelegatingOAuth2TokenValidator<>(issuerValidator, audienceValidator, accessTokenValidator);
    }

    private static void requireConfigured(String value, String name) {
        if (value == null || value.isBlank() || !value.equals(value.strip()) || value.contains("${")) {
            throw new IllegalArgumentException(name + " must be explicitly configured without surrounding whitespace");
        }
    }

    @Bean
    SecurityFilterChain security(HttpSecurity http, ObjectMapper objectMapper) throws Exception {
        AuthenticationEntryPoint unauthorized = (request, response, exception) -> {
            // Preserve the bearer challenge without exposing decoder messages or token
            // claims.
            boolean invalidToken = exception instanceof OAuth2AuthenticationException oauth2Exception
                    && "invalid_token".equals(oauth2Exception.getError().getErrorCode());
            response.setHeader(HttpHeaders.WWW_AUTHENTICATE,
                    invalidToken ? "Bearer error=\"invalid_token\"" : "Bearer");
            writeError(objectMapper, request, response, 401, "UNAUTHORIZED");
        };
        return http.csrf(csrf -> csrf.disable())
                .cors(Customizer.withDefaults())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(
                        authorize -> authorize
                                .requestMatchers("/swagger-ui.html", "/swagger-ui/**", "/v3/api-docs/**",
                                        "/actuator/health")
                                .permitAll()
                                .anyRequest()
                                .authenticated())
                .exceptionHandling(
                        exceptions -> exceptions
                                .authenticationEntryPoint(unauthorized)
                                .accessDeniedHandler(
                                        (request, response, exception) -> writeError(objectMapper, request, response,
                                                403, "FORBIDDEN")))
                .oauth2ResourceServer(oauth2 -> oauth2.jwt(Customizer.withDefaults())
                        .authenticationEntryPoint(unauthorized))
                .build();
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource() {
        var configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(allowedOrigins);
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("Authorization", "Content-Type"));
        configuration.setExposedHeaders(List.of(HttpHeaders.WWW_AUTHENTICATE));
        configuration.setAllowCredentials(false);
        var source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", configuration);
        return source;
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
