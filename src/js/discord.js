import { discordConfig } from './config.js';

export const hasDiscordWebhook = Boolean(
  discordConfig?.webhookUrl &&
  discordConfig.webhookUrl.startsWith('https://discord.com/api/webhooks/')
);

export async function notifyDiscord({ title, description = '', fields = [], color = 0x2f80ed }) {
  if (!hasDiscordWebhook) return;

  const normalizedFields = fields
    .filter((field) => field?.name && field?.value !== undefined && field?.value !== null)
    .map((field) => ({
      name: String(field.name).slice(0, 256),
      value: String(field.value || '-').slice(0, 1024),
      inline: field.inline ?? true,
    }));

  try {
    await fetch(discordConfig.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'SponsorGo Central',
        allowed_mentions: { parse: [] },
        embeds: [{
          title: String(title || 'SponsorGo').slice(0, 256),
          description: String(description || '').slice(0, 4096),
          color,
          fields: normalizedFields,
          timestamp: new Date().toISOString(),
        }],
      }),
    });
  } catch (error) {
    console.warn('Nao foi possivel enviar notificacao para o Discord:', error);
  }
}
