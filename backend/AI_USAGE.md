# AI usage

This implementation was authored with AI assistance and reviewed by a human for tenant scoping, validation, transactional booking behavior, frontend accessibility, and documentation accuracy. AI-assisted tasks included adding regression coverage, replacing an incorrect browser-auth integration with the official **Okta** React/Auth JS SDKs, configuring Okta Authorization Code + PKCE token handling, tightening persisted assignment display, and adding dated staff-unavailability exceptions. No credentials, API keys, complete tokens, or production/personal data were used.

The developer reviewed the generated changes and remains responsible for provisioning Okta, validating the supplied MySQL deployment, and verifying the required parallel-booking tests. Final validation commands are documented in the root README; external Okta login requires evaluator-provided Okta SPA configuration.
