package com.runloyal.booking.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mockStatic;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.JwtDecoders;
import org.springframework.security.oauth2.jwt.JwtValidationException;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.test.util.ReflectionTestUtils;

class SecurityConfigTest {
    private static final String ISSUER = "https://org.okta.com/oauth2/default";
    private static final String AUDIENCE = "api://default";
    private static KeyPair signingKey;
    private static KeyPair untrustedKey;

    @BeforeAll
    static void generateLocalKeys() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        signingKey = generator.generateKeyPair();
        untrustedKey = generator.generateKeyPair();
    }

    @ParameterizedTest
    @ValueSource(strings = {
        ISSUER,
        "https://org.okta.com/oauth2/aus123456789",
        "https://login.example.test/oauth2/custom-server_1"
    })
    void acceptsSignedTokensFromConfiguredCustomServer(String issuer) throws JOSEException {
        var jwt = decoder(issuer, AUDIENCE).decode(sign(claims().issuer(issuer), signingKey));

        assertEquals("00u-test-user", jwt.getSubject());
        assertEquals(issuer, jwt.getClaimAsString("iss"));
        assertEquals(List.of(AUDIENCE), jwt.getAudience());
    }

    @Test
    void acceptsConfiguredAudienceAmongMultipleAudiences() throws JOSEException {
        String audience = "https://booking.example.test/api";
        var jwt = decoder(ISSUER, audience).decode(
                sign(claims().audience(List.of("another-api", audience)), signingKey));

        assertTrue(jwt.getAudience().contains(audience));
    }

    @Test
    void rejectsWrongAudience() throws JOSEException {
        assertRejected(claims().audience("api://another"));
    }

    @Test
    void rejectsDefaultAudienceWhenDifferentAudienceIsConfigured() throws JOSEException {
        NimbusJwtDecoder decoder = decoder(ISSUER, "api://booking");
        String token = sign(claims(), signingKey);

        assertThrows(JwtValidationException.class, () -> decoder.decode(token));
    }

    @Test
    void rejectsMissingAudience() throws JOSEException {
        assertRejected(claims().claim("aud", null));
    }

    @Test
    void rejectsEmptyAudience() throws JOSEException {
        assertRejected(claims().audience(List.of()));
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "https://other.okta.com/oauth2/default",
        "https://org.okta.com/oauth2/another",
        "https://org.okta.com",
        "https://org.okta.com/oauth2/default/"
    })
    void rejectsWrongIssuer(String issuer) throws JOSEException {
        assertRejected(claims().issuer(issuer));
    }

    @Test
    void rejectsMissingIssuer() throws JOSEException {
        assertRejected(claims().issuer(null));
    }

    @Test
    void rejectsExpiredTokenBeyondDefaultClockSkew() throws JOSEException {
        assertRejected(claims()
                .issueTime(Date.from(Instant.now().minusSeconds(600)))
                .expirationTime(Date.from(Instant.now().minusSeconds(120))));
    }

    @Test
    void rejectsMissingExpiration() throws JOSEException {
        assertRejected(claims().expirationTime(null));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", "\t"})
    void rejectsMissingOrBlankSubject(String subject) throws JOSEException {
        assertRejected(claims().subject(subject));
    }

    @Test
    void preservesTheAccessTokenSubjectRatherThanIdTokenUserId() throws JOSEException {
        var jwt = decoder(ISSUER, AUDIENCE).decode(sign(claims()
                .subject("assigned-user@example.test").claim("uid", "00u-different-id"), signingKey));

        assertEquals("assigned-user@example.test", jwt.getSubject());
    }

    @Test
    void rejectsIdTokenEvenWhenApiAudienceIsMisconfiguredAsClientId() throws JOSEException {
        String clientId = "spa-client-id";
        NimbusJwtDecoder decoder = decoder(ISSUER, clientId);
        String idToken = sign(claims().audience(clientId).claim("scp", null)
                .claim("nonce", "oidc-nonce"), signingKey);

        assertThrows(JwtValidationException.class, () -> decoder.decode(idToken));
    }

    @Test
    void rejectsIdTokenAudienceForTheApi() throws JOSEException {
        assertRejected(claims().audience("spa-client-id").claim("scp", null));
    }

    @Test
    void rejectsMissingEmptyOrMalformedAccessTokenScopes() throws JOSEException {
        assertRejected(claims().claim("scp", null));
        assertRejected(claims().claim("scp", List.of()));
        assertRejected(claims().claim("scp", "openid profile"));
        assertRejected(claims().claim("scp", List.of(" ")));
        assertRejected(claims().claim("scp", List.of("openid", 123)));
    }

    @Test
    void rejectsTokenNotYetValidBeyondDefaultClockSkew() throws JOSEException {
        assertRejected(claims().notBeforeTime(Date.from(Instant.now().plusSeconds(120))));
    }

    @Test
    void rejectsUntrustedSignatureEvenWithValidClaims() throws JOSEException {
        NimbusJwtDecoder decoder = decoder(ISSUER, AUDIENCE);
        String token = sign(claims(), untrustedKey);

        assertThrows(BadJwtException.class, () -> decoder.decode(token));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {
        " ",
        "\t",
        "${OKTA_ISSUER_URI}",
        "not a URI",
        "http://org.okta.com/oauth2/default",
        "https://org.okta.com",
        "https://org.okta.com/",
        "https://org.okta.com/oauth2",
        "https://org.okta.com/oauth2/",
        "https://org.okta.com/oauth2/default/",
        "https://org.okta.com/oauth2/default/v1/keys",
        "https://org.okta.com/oauth2/default?query=value",
        "https://org.okta.com/oauth2/default?",
        "https://org.okta.com/oauth2/default#fragment",
        "https://user@org.okta.com/oauth2/default",
        "https://user:password@org.okta.com/oauth2/default",
        "https:///oauth2/default",
        "https://org.okta.com:0/oauth2/default",
        "https://org.okta.com:65536/oauth2/default",
        "https://org.okta.com/oauth2/..",
        "https://org.okta.com/oauth2/%64efault",
        "https://org.okta.com/oauth2/default%2Fother",
        " https://org.okta.com/oauth2/default",
        "https://org.okta.com/oauth2/default "
    })
    void rejectsInvalidIssuerConfigurationBeforeDiscovery(String issuer) {
        assertInvalidConfiguration(issuer, AUDIENCE, "OKTA_ISSUER_URI");
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", "\t", "${OKTA_AUDIENCE}", " api://default", "api://default "})
    void rejectsInvalidAudienceConfigurationBeforeDiscovery(String audience) {
        assertInvalidConfiguration(ISSUER, audience, "OKTA_AUDIENCE");
    }

    private static JWTClaimsSet.Builder claims() {
        return new JWTClaimsSet.Builder()
                .issuer(ISSUER)
                .subject("00u-test-user")
                .audience(AUDIENCE)
                .claim("scp", List.of("openid", "profile", "email"))
                .issueTime(Date.from(Instant.now().minusSeconds(30)))
                .expirationTime(Date.from(Instant.now().plusSeconds(300)));
    }

    private static String sign(JWTClaimsSet.Builder claims, KeyPair key) throws JOSEException {
        SignedJWT jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.RS256), claims.build());
        jwt.sign(new RSASSASigner((RSAPrivateKey) key.getPrivate()));
        return jwt.serialize();
    }

    private static SecurityConfig configuration(String issuer, String audience) {
        SecurityConfig config = new SecurityConfig();
        ReflectionTestUtils.setField(config, "issuerUri", issuer);
        ReflectionTestUtils.setField(config, "audience", audience);
        return config;
    }

    private static NimbusJwtDecoder decoder(String issuer, String audience) {
        // Use the production bean's validator wiring, but never perform OIDC discovery or HTTP requests.
        NimbusJwtDecoder localDecoder = NimbusJwtDecoder
                .withPublicKey((RSAPublicKey) signingKey.getPublic()).build();
        try (var discovery = mockStatic(JwtDecoders.class)) {
            discovery.when(() -> JwtDecoders.fromIssuerLocation(issuer)).thenReturn(localDecoder);

            assertSame(localDecoder, configuration(issuer, audience).jwtDecoder());
            discovery.verify(() -> JwtDecoders.fromIssuerLocation(issuer));
        }
        return localDecoder;
    }

    private static void assertRejected(JWTClaimsSet.Builder claims) throws JOSEException {
        NimbusJwtDecoder decoder = decoder(ISSUER, AUDIENCE);
        String token = sign(claims, signingKey);

        JwtValidationException exception = assertThrows(JwtValidationException.class, () -> decoder.decode(token));
        assertTrue(exception.getErrors().stream().anyMatch(error -> "invalid_token".equals(error.getErrorCode())));
    }

    private static void assertInvalidConfiguration(String issuer, String audience, String setting) {
        try (var discovery = mockStatic(JwtDecoders.class)) {
            IllegalArgumentException exception = assertThrows(
                    IllegalArgumentException.class, () -> configuration(issuer, audience).jwtDecoder());

            assertTrue(exception.getMessage().contains(setting));
            discovery.verifyNoInteractions();
        }
    }
}