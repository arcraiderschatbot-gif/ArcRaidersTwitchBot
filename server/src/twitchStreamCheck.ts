/**
 * Check if the configured Twitch channel (streamer) is live via Helix API.
 * Used to start the bot only when the streamer is live (e.g. in Docker on Railway).
 */

import { Config } from './config';

const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const TWITCH_STREAMS_URL = 'https://api.twitch.tv/helix/streams';

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getAppAccessToken(clientId: string, clientSecret: string): Promise<string | null> {
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) return cachedToken;
  const res = await fetch(
    `${TWITCH_TOKEN_URL}?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`,
    { method: 'POST' }
  );
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) return null;
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
  return cachedToken;
}

/** Returns true if the configured channel (config.twitch.channel) is currently live. */
export async function isStreamLive(config: Config): Promise<boolean> {
  const { clientId, clientSecret, channel } = config.twitch;
  if (!clientId || !clientSecret || !channel) return false;
  const token = await getAppAccessToken(clientId, clientSecret);
  if (!token) return false;
  const res = await fetch(
    `${TWITCH_STREAMS_URL}?user_login=${encodeURIComponent(channel)}`,
    {
      headers: {
        'Client-ID': clientId,
        Authorization: `Bearer ${token}`,
      },
    }
  );
  const data = (await res.json()) as { data?: unknown[] };
  return Array.isArray(data.data) && data.data.length > 0;
}

/** Poll until the stream is live, then resolve. Checks every pollIntervalMs. */
export function waitUntilStreamLive(
  config: Config,
  pollIntervalMs: number = 60_000
): Promise<void> {
  return new Promise((resolve) => {
    const check = async () => {
      const live = await isStreamLive(config);
      if (live) {
        console.log(`Stream is live (${config.twitch.channel}). Starting bot.`);
        resolve();
        return;
      }
      setTimeout(check, pollIntervalMs);
    };
    check();
  });
}
