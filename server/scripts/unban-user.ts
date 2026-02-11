#!/usr/bin/env tsx
import dotenv from 'dotenv';
import path from 'path';
import { Repo } from '../src/db/repo';
import { loadConfig } from '../src/config';

// Load .env file
const envPath = path.resolve(process.cwd(), '.env');
const fallbackEnvPath = path.resolve(process.cwd(), '..', '.env');
dotenv.config({ path: envPath });
if (!process.env.DB_PATH) {
  dotenv.config({ path: fallbackEnvPath });
}

const config = loadConfig();
const repo = new Repo(config.database.path);

const twitchName = process.argv[2];

if (!twitchName) {
  console.error('❌ Usage: tsx scripts/unban-user.ts <twitch_username>');
  console.error('   Example: tsx scripts/unban-user.ts pacifica_obscura');
  repo.close();
  process.exit(1);
}

const user = repo.getUserByTwitchName(twitchName);

if (!user) {
  console.error(`❌ User "${twitchName}" not found.`);
  repo.close();
  process.exit(1);
}

if (!user.banned) {
  console.log(`ℹ️  User "${twitchName}" is not banned.`);
  repo.close();
  process.exit(0);
}

const success = repo.unbanUserByTwitchName(twitchName);

if (success) {
  console.log(`✅ User "${twitchName}" has been unbanned.`);
  console.log(`   Callsign: ${user.callsign || 'N/A'}`);
  console.log(`   User ID: ${user.id}`);
} else {
  console.error(`❌ Failed to unban user "${twitchName}".`);
  repo.close();
  process.exit(1);
}

repo.close();
process.exit(0);
