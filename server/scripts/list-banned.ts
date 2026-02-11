#!/usr/bin/env tsx
import dotenv from 'dotenv';
import path from 'path';
import Database from 'better-sqlite3';
import { loadConfig } from '../src/config';

// Load .env file
const envPath = path.resolve(process.cwd(), '.env');
const fallbackEnvPath = path.resolve(process.cwd(), '..', '.env');
dotenv.config({ path: envPath });
if (!process.env.DB_PATH) {
  dotenv.config({ path: fallbackEnvPath });
}

const config = loadConfig();
const db = new Database(config.database.path);

const bannedUsers = db.prepare(`
  SELECT id, twitchName, callsign, createdAt, credits, raidsPlayed, extracts, deaths
  FROM users
  WHERE banned = 1
  ORDER BY twitchName
`).all() as any[];

if (bannedUsers.length === 0) {
  console.log('ℹ️  No banned users found.');
} else {
  console.log(`📋 Found ${bannedUsers.length} banned user(s):\n`);
  bannedUsers.forEach((user, index) => {
    console.log(`${index + 1}. ${user.twitchName}`);
    if (user.callsign) {
      console.log(`   Callsign: ${user.callsign}`);
    }
    console.log(`   ID: ${user.id}`);
    console.log(`   Created: ${new Date(user.createdAt).toLocaleString()}`);
    console.log(`   Stats: ${user.raidsPlayed} raids, ${user.extracts} extracts, ${user.deaths} deaths`);
    console.log(`   Credits: ${user.credits.toLocaleString()}`);
    console.log('');
  });
}

db.close();
process.exit(0);
