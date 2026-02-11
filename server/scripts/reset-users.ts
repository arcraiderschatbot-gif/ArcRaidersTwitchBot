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

console.log('⚠️  WARNING: This will delete ALL users and their associated data!');
console.log('This includes:');
console.log('  - All user accounts');
console.log('  - All inventories');
console.log('  - All owned titles');
console.log('  - All redemptions');
console.log('  - All kill records');
console.log('');
console.log('Raids will NOT be deleted (only user participation records).');
console.log('');

// Get confirmation
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question('Type "RESET ALL USERS" to confirm: ', (answer: string) => {
  if (answer !== 'RESET ALL USERS') {
    console.log('❌ Reset cancelled.');
    rl.close();
    repo.close();
    process.exit(0);
  }

  console.log('\n🔄 Resetting all users...');
  const result = repo.resetAllUsers();

  console.log('✅ Reset complete!');
  console.log(`   Deleted ${result.deletedUsers} users`);
  console.log(`   Deleted ${result.deletedInventory} inventory items`);
  console.log(`   Deleted ${result.deletedTitles} owned titles`);
  console.log(`   Deleted ${result.deletedRedemptions} redemptions`);
  console.log(`   Deleted ${result.deletedKills} kill records`);

  rl.close();
  repo.close();
  process.exit(0);
});
