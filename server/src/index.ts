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
import express from 'express';

async function main() {
  const config = loadConfig();

  // Validate required config
  if (!config.twitch.username || !config.twitch.oauthToken || !config.twitch.channel) {
    console.error('Missing required Twitch configuration. Check your .env file.');
    console.error('Required variables: TWITCH_USERNAME, TWITCH_OAUTH_TOKEN, TWITCH_CHANNEL');
    process.exit(1);
  }

  // Initialize database
  const repo = new Repo(config.database.path);
  console.log('Database initialized');

  // Initialize game systems
  const raidEngine = new RaidEngine(repo, config);
  const economy = new Economy(repo);
  const cashInSystem = new CashInSystem(repo, config, economy);
  const titlesSystem = new TitlesSystem(repo, economy);
  const vendettaSystem = new VendettaSystem(repo);

  // Initialize bot
  const bot = new Bot(config, repo);
  await bot.connect();

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
