/**
 * Singleton MSAL (Microsoft Authentication Library) instance.
 *
 * Provides a shared, pre-initialized PublicClientApplication for use
 * across the app (Outlook import, DevOps import, future integrations).
 *
 * Usage:
 *   import { getMsalInstance } from './msalInstance'
 *   const { msal, ready } = getMsalInstance()
 *   await ready
 *   const accounts = msal.getAllAccounts()
 */

import { PublicClientApplication } from '@azure/msal-browser'
import { msalConfig } from './msalConfig'

let msalInstance = null
let msalReady = null

export function getMsalInstance() {
  if (!msalInstance) {
    msalInstance = new PublicClientApplication(msalConfig)
    msalReady = msalInstance.initialize().then(() =>
      msalInstance.handleRedirectPromise().catch(() => null)
    )
  }
  return { msal: msalInstance, ready: msalReady }
}
