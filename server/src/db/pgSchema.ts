import { Client } from 'pg';

const TITLES_SEED = [
  { name: 'Rookie I', tier: 'Rookie', rank: 1, cost: 0, displayOrder: 1 },
  { name: 'Rookie II', tier: 'Rookie', rank: 2, cost: 2500, displayOrder: 2 },
  { name: 'Rookie III', tier: 'Rookie', rank: 3, cost: 5000, displayOrder: 3 },
  { name: 'Tryhard I', tier: 'Tryhard', rank: 1, cost: 10000, displayOrder: 4 },
  { name: 'Tryhard II', tier: 'Tryhard', rank: 2, cost: 15000, displayOrder: 5 },
  { name: 'Tryhard III', tier: 'Tryhard', rank: 3, cost: 20000, displayOrder: 6 },
  { name: 'Wildcard I', tier: 'Wildcard', rank: 1, cost: 30000, displayOrder: 7 },
  { name: 'Wildcard II', tier: 'Wildcard', rank: 2, cost: 40000, displayOrder: 8 },
  { name: 'Wildcard III', tier: 'Wildcard', rank: 3, cost: 50000, displayOrder: 9 },
  { name: 'Daredevil I', tier: 'Daredevil', rank: 1, cost: 65000, displayOrder: 10 },
  { name: 'Daredevil II', tier: 'Daredevil', rank: 2, cost: 80000, displayOrder: 11 },
  { name: 'Daredevil III', tier: 'Daredevil', rank: 3, cost: 100000, displayOrder: 12 },
  { name: 'Hotshot', tier: 'Hotshot', rank: 0, cost: 150000, displayOrder: 13 },
];

export async function createSchemaPg(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      "twitchName" TEXT UNIQUE NOT NULL,
      callsign TEXT,
      "createdAt" BIGINT NOT NULL,
      credits INTEGER NOT NULL DEFAULT 0,
      "lifetimeCredEarned" INTEGER NOT NULL DEFAULT 0,
      "lifetimeCredSpent" INTEGER NOT NULL DEFAULT 0,
      "raidsPlayed" INTEGER NOT NULL DEFAULT 0,
      extracts INTEGER NOT NULL DEFAULT 0,
      deaths INTEGER NOT NULL DEFAULT 0,
      "hasUsedFreeLoadout" SMALLINT NOT NULL DEFAULT 0,
      "hasFirstExtractRewarded" SMALLINT NOT NULL DEFAULT 0,
      "activeTitleId" INTEGER,
      "cantinaLegend" SMALLINT NOT NULL DEFAULT 0,
      "pingCount" INTEGER NOT NULL DEFAULT 0,
      "killsCredited" INTEGER NOT NULL DEFAULT 0,
      "deathsAttributed" INTEGER NOT NULL DEFAULT 0,
      banned SMALLINT NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS titles (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      tier TEXT NOT NULL,
      rank INTEGER NOT NULL,
      cost INTEGER NOT NULL,
      "displayOrder" INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS owned_titles (
      "userId" INTEGER NOT NULL REFERENCES users(id),
      "titleId" INTEGER NOT NULL REFERENCES titles(id),
      "purchasedAt" BIGINT NOT NULL,
      PRIMARY KEY ("userId", "titleId")
    );
    CREATE TABLE IF NOT EXISTS inventory (
      id SERIAL PRIMARY KEY,
      "userId" INTEGER NOT NULL REFERENCES users(id),
      "itemId" TEXT NOT NULL,
      "itemName" TEXT NOT NULL,
      "itemCategory" TEXT NOT NULL,
      tier TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      "sellValueCred" INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS raids (
      id SERIAL PRIMARY KEY,
      "startedAt" BIGINT NOT NULL,
      "endedAt" BIGINT,
      "mapName" TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'IDLE'
    );
    CREATE TABLE IF NOT EXISTS raid_participants (
      "raidId" INTEGER NOT NULL REFERENCES raids(id),
      "userId" INTEGER NOT NULL REFERENCES users(id),
      loadout TEXT NOT NULL,
      extracted SMALLINT NOT NULL DEFAULT 0,
      "creditsGained" INTEGER NOT NULL DEFAULT 0,
      "itemsJson" TEXT,
      PRIMARY KEY ("raidId", "userId")
    );
    CREATE TABLE IF NOT EXISTS redemptions (
      id SERIAL PRIMARY KEY,
      "userId" INTEGER NOT NULL REFERENCES users(id),
      type TEXT NOT NULL,
      cost INTEGER NOT NULL,
      "createdAt" BIGINT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      "approvedBy" TEXT,
      "approvedAt" BIGINT,
      "completedAt" BIGINT,
      "customText" TEXT
    );
    CREATE TABLE IF NOT EXISTS kills (
      "killerUserId" INTEGER NOT NULL REFERENCES users(id),
      "victimUserId" INTEGER NOT NULL REFERENCES users(id),
      count INTEGER NOT NULL DEFAULT 1,
      "lastAt" BIGINT NOT NULL,
      PRIMARY KEY ("killerUserId", "victimUserId")
    );
    CREATE TABLE IF NOT EXISTS kill_events (
      id SERIAL PRIMARY KEY,
      "raidId" INTEGER NOT NULL REFERENCES raids(id),
      "killerUserId" INTEGER NOT NULL REFERENCES users(id),
      "victimUserId" INTEGER NOT NULL REFERENCES users(id),
      "createdAt" BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS maps_cache (
      name TEXT PRIMARY KEY,
      "difficultyScalar" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
      "encounterBias" INTEGER NOT NULL DEFAULT 0,
      "lastUpdated" BIGINT NOT NULL
    );
  `);

  for (const t of TITLES_SEED) {
    await client.query(
      `INSERT INTO titles (name, tier, rank, cost, "displayOrder") VALUES ($1, $2, $3, $4, $5) ON CONFLICT (name) DO NOTHING`,
      [t.name, t.tier, t.rank, t.cost, t.displayOrder]
    );
  }
}
