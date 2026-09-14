# RunLoyal frontend

React 18 / TypeScript administration portal built with Vite, TanStack Query, and the Okta React/Auth JS SDKs. Login uses Authorization Code + PKCE with an Okta-hosted sign-in page.

## Prerequisites

- Current Node.js LTS and npm.
- The [backend](../backend/README.md) running on http://localhost:8080.
- An Okta OIDC Single-Page Application with assigned users and a custom authorization server. Follow the [shared Okta setup](../README.md#okta-setup).

## Configure

Run all commands below from the `frontend` directory. For a new installation only, create the local configuration in PowerShell:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Edit the local values using [.env.example](.env.example) as the template. Do not overwrite a working configuration.

| Variable | Value |
| --- | --- |
| `VITE_OKTA_ISSUER` | Exact same custom HTTPS issuer as the backend's `OKTA_ISSUER_URI`, such as `https://your-org.okta.com/oauth2/default`; no trailing slash |
| `VITE_OKTA_CLIENT_ID` | Public Client ID of the Okta SPA |
| `VITE_OKTA_SCOPES` | `openid profile email`; append custom scopes only when required by the access policy |
| `VITE_OKTA_REDIRECT_URI` | `http://localhost:3000/login/callback`; blank uses the current origin plus `/login/callback` |
| `VITE_OKTA_LOGOUT_URI` | `http://localhost:3000/`; blank uses the current origin plus `/` |
| `VITE_API_BASE_URL` | `http://localhost:8080`, the development proxy target |

Register the exact sign-in and sign-out URLs in Okta. Add `http://localhost:3000` as a Trusted Origin for applicable CORS/Redirect operations and configure a matching authorization-server access policy and rule. Use `localhost` consistently rather than alternating with `127.0.0.1`.

There is no frontend audience setting: the backend validates the audience configured on the custom authorization server. All `VITE_` variables are public browser configuration; never include passwords, tokens, or client secrets. Restart Vite after changing environment values.

## Run locally

```sh
npm ci
npm run dev
```

Open http://localhost:3000. The development command requires port 3000 and exits if it is occupied, keeping the registered Okta redirects consistent. Stop an existing portal instance before restarting.

[vite.config.ts](vite.config.ts) proxies `/api` requests to `VITE_API_BASE_URL`. Keep the backend running in a separate terminal. If backend startup reports an Okta `PKIX` certificate error, use the [Windows certificate-trust command](../backend/README.md#windows-certificate-trust); changing frontend configuration will not fix Java's truststore.

After login, the API must resolve an ACTIVE tenant membership from the access-token subject. Complete [Map Okta users to tenants](../README.md#map-okta-users-to-tenants) before testing tenant-admin or staff access.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server on port 3000 |
| `npm test` | Run Vitest / React Testing Library tests once |
| `npm run test:watch` | Watch and rerun tests |
| `npm run lint` | Run ESLint |
| `npm run build` | Check TypeScript and generate the production bundle in `dist` |
| `npm run preview` | Preview an existing production bundle locally; not a production server |

## Deployment

Configure public environment values before building. Production hosting must serve `/login/callback` through the SPA routing fallback and proxy `/api` to the backend on the same origin. The Vite development proxy is not included in the production bundle. Register the exact production HTTPS sign-in/sign-out URLs in Okta; a local preview on another port also needs matching registrations and API routing.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Authentication configuration required | Replace template issuer/client placeholders, use a custom `/oauth2/{id}` issuer, and restart Vite |
| Okta policy evaluation failed | SPA/user assignment and a matching active access policy and rule on the same authorization server |
| Redirect or logout rejected | Exact registered URLs, hostname, port, and trailing logout slash |
| API proxy connection refused | Backend running on the configured host/port; inspect backend startup logs |
| API 401 | Access-token issuer/audience/expiry and the backend's Okta configuration |
| API 403 / No active tenant membership | Exact access-token `sub`, ACTIVE database membership, tenant ownership, and role |

See the [root README](../README.md) for full setup and demo data, and [technical notes](../backend/TECHNICAL_NOTES.md#known-limitations) for known limitations. Health checks and a successful login redirect alone do not establish full authenticated-flow or concurrency coverage.