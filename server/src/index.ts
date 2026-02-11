import dotenv from 'dotenv';
import path from 'path';

// Load .env file from project root (parent directory of server)
// process.cwd() is /server when running via npm, so go up one level
const envPath = path.resolve(process.cwd(), '..', '.env');
dotenv.config({ path: envPath });

import { loadConfig } from './config';
import { Repo } from './db/repo';
import { Bot } from './bot/bot';
import { RaidScheduler } from './game/raidScheduler';
import { RaidEngine } from './game/raidEngine';
import { Economy } from './game/economy';
import { CashInSystem } from './game/cashin';
import { TitlesSystem } from './game/titles';
import { VendettaSystem } from './game/vendetta';
import { createEBS } from './http/ebs';
import { waitUntilStreamLive, isStreamLive } from './twitchStreamCheck';
import express from 'express';

async function main() {
  const config = loadConfig();

  // Validate required config
  if (!config.twitch.username || !config.twitch.oauthToken || !config.twitch.channel) {
    console.error('Missing required Twitch configuration. Check your .env file.');
    console.error('Required variables: TWITCH_USERNAME, TWITCH_OAUTH_TOKEN, TWITCH_CHANNEL');
    process.exit(1);
  }

  // Initialize database (PostgreSQL when DATABASE_URL set e.g. Railway, else SQLite)
  const repo = config.database.url
    ? await Repo.createRepo(config.database.path, config.database.url)
    : new Repo(config.database.path);
  console.log('Database initialized');

  // Initialize game systems
  const raidEngine = new RaidEngine(repo, config);
  const economy = new Economy(repo);
  const cashInSystem = new CashInSystem(repo, config, economy);
  const titlesSystem = new TitlesSystem(repo, economy);
  const vendettaSystem = new VendettaSystem(repo);

  // When TWITCH_CLIENT_ID + TWITCH_CLIENT_SECRET are set, start bot only when channel is live (e.g. Docker on Railway)
  if (config.twitch.clientId && config.twitch.clientSecret) {
    console.log(`Waiting for ${config.twitch.channel} to go live before connecting bot (check every 60s)...`);
    await waitUntilStreamLive(config, 60_000);
  }

  // Initialize bot
  const bot = new Bot(config, repo);
  await bot.connect();

  // Optional: when stream-live gating is enabled, poll and disconnect when stream goes offline (then wait and reconnect)
  if (config.twitch.clientId && config.twitch.clientSecret) {
    let reconnecting = false;
    const STREAM_CHECK_MS = 3 * 60 * 1000; // 3 min
    setInterval(async () => {
      if (reconnecting) return;
      const live = await isStreamLive(config);
      if (!live) {
        reconnecting = true;
        console.log(`Stream went offline. Disconnecting bot.`);
        bot.disconnect();
        console.log(`Waiting for ${config.twitch.channel} to go live again...`);
        await waitUntilStreamLive(config, 60_000);
        await bot.connect();
        reconnecting = false;
      }
    }, STREAM_CHECK_MS);
  }

  // Initialize EBS
  const raidScheduler = bot.getRaidScheduler();
  const ebs = createEBS(
    repo,
    config,
    raidScheduler,
    economy,
    cashInSystem,
    titlesSystem,
    vendettaSystem
  );

  const port = process.env.PORT || 3000;
  const server = ebs.listen(port, () => {
    console.log(`EBS server listening on port ${port}`);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('Shutting down...');
    bot.disconnect();
    repo.close();
    server.close(() => {
      process.exit(0);
    });
  });

  process.on('SIGTERM', () => {
    console.log('Shutting down...');
    bot.disconnect();
    repo.close();
    server.close(() => {
      process.exit(0);
    });
  });
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
