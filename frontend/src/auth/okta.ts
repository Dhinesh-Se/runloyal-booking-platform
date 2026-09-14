import { OktaAuth } from '@okta/okta-auth-js'
import type { AuthConfig } from './config'

// A module-level instance survives React rerenders and StrictMode initializers.
let cached: { key: string; client: OktaAuth } | undefined

export function getOktaClient(config: AuthConfig): OktaAuth {
  const key = JSON.stringify(config)
  if (cached?.key === key) return cached.client
  const storageKey = `runloyal:okta:${encodeURIComponent(config.issuer)}:${encodeURIComponent(config.clientId)}`
  const client = new OktaAuth({
    ...config,
    pkce: true,
    responseType: 'code',
    // PKCE transaction metadata must not be copied to cross-tab localStorage.
    transactionManager: { enableSharedStorage: false },
    storageManager: {
      token: { storageTypes: ['sessionStorage'] },
      transaction: { storageTypes: ['sessionStorage'], storageKey: `${storageKey}:transaction` },
      cache: { storageTypes: ['sessionStorage'], storageKey: `${storageKey}:cache` },
    },
    tokenManager: { storageKey, autoRenew: false, autoRemove: false, syncStorage: false },
    // All renewal goes through the API bridge and its tracked pending-token set.
    services: { autoRenew: false, autoRemove: false, syncStorage: false, renewOnTabActivation: false },
  })
  cached = { key, client }
  return client
}