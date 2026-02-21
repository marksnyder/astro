/**
 * MSAL (Microsoft Authentication Library) configuration.
 *
 * To use this feature:
 * 1. Register an app in Azure AD (https://portal.azure.com → App registrations)
 * 2. Set "Single-page application" redirect URI to your app's URL (e.g. http://localhost:5173)
 * 3. Under API Permissions, add:
 *    - Microsoft Graph → Delegated → Mail.Read  (for Outlook)
 *    - Azure DevOps → Delegated → user_impersonation  (for PRs)
 * 4. Copy the Application (client) ID below
 * 5. Fill in your Azure DevOps organization and (optionally) project
 */

export const msalConfig = {
  auth: {
    clientId: '20d1966b-3b5a-48f8-91e5-de4b2e4e2067', // <-- Paste your Azure AD Application (client) ID here
    authority: 'https://login.microsoftonline.com/organizations',
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'localStorage',
    storeAuthStateInCookie: true,
  },
}

// Outlook
export const loginRequest = {
  scopes: ['Mail.Read'],
}
export const graphMailEndpoint = 'https://graph.microsoft.com/v1.0/me/messages'

// Azure DevOps
export const devopsLoginRequest = {
  scopes: ['499b84ac-1321-427f-aa17-267ca6975798/user_impersonation'],
}
export const devopsOrg = 'synthetaic-org'    // <-- Your Azure DevOps organization name (e.g. 'mycompany')
export const devopsProject = 'RAIC-V1' // <-- Optional: limit to a specific project (leave empty for all projects)
