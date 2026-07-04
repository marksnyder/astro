/** Bot scopes required for Astro agent task delivery. */
export const SLACK_BOT_SCOPES = [
  'chat:write',
  'chat:write.public',
  'channels:read',
  'groups:read',
  'users:read',
]

const DEFAULT_LONG_DESCRIPTION =
  'Astro Agent Tasks connects your self-hosted Astro instance to Slack. The bot posts scheduled or on-demand instructions from markdown notes to channels and @mentions users or agents. Install the app to your workspace, invite the bot to target channels, then paste the Bot User OAuth Token (xoxb-…) into Astro Settings.'

export function buildSlackAppManifest({
  appName = 'Astro Agent Tasks',
  botDisplayName = 'Astro',
} = {}) {
  const name = (appName || 'Astro Agent Tasks').trim()
  const botName = (botDisplayName || 'Astro').trim()
  return {
    _metadata: {
      major_version: 2,
      minor_version: 1,
    },
    display_information: {
      name,
      description: 'Posts agent task instructions from Astro to Slack channels.',
      long_description: DEFAULT_LONG_DESCRIPTION,
      background_color: '#1a1a2e',
    },
    features: {
      bot_user: {
        display_name: botName,
        always_online: false,
      },
    },
    oauth_config: {
      scopes: {
        bot: [...SLACK_BOT_SCOPES],
      },
    },
    settings: {
      org_deploy_enabled: false,
      socket_mode_enabled: false,
      token_rotation_enabled: false,
    },
  }
}

function yamlQuote(value) {
  const s = String(value)
  if (/[:#\n'"\\]|^\s|\s$/.test(s) || s === 'true' || s === 'false') {
    return JSON.stringify(s)
  }
  return s
}

export function manifestToJson(manifest) {
  return JSON.stringify(manifest, null, 2)
}

export function manifestToYaml(manifest) {
  const scopeLines = manifest.oauth_config.scopes.bot.map((s) => `      - ${s}`).join('\n')
  const d = manifest.display_information
  const bot = manifest.features.bot_user
  return `_metadata:
  major_version: ${manifest._metadata.major_version}
  minor_version: ${manifest._metadata.minor_version}
display_information:
  name: ${yamlQuote(d.name)}
  description: ${yamlQuote(d.description)}
  long_description: ${yamlQuote(d.long_description)}
  background_color: "${d.background_color}"
features:
  bot_user:
    display_name: ${yamlQuote(bot.display_name)}
    always_online: false
oauth_config:
  scopes:
    bot:
${scopeLines}
settings:
  org_deploy_enabled: false
  socket_mode_enabled: false
  token_rotation_enabled: false
`
}

export function formatSlackManifest(manifest, format = 'yaml') {
  return format === 'json' ? manifestToJson(manifest) : manifestToYaml(manifest)
}
