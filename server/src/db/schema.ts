import Database from 'better-sqlite3';

export function createSchema(db: Database.Database) {
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      twitchName TEXT UNIQUE NOT NULL,
      callsign TEXT,
      createdAt INTEGER NOT NULL,
      credits INTEGER NOT NULL DEFAULT 0,
      lifetimeCredEarned INTEGER NOT NULL DEFAULT 0,
      lifetimeCredSpent INTEGER NOT NULL DEFAULT 0,
      raidsPlayed INTEGER NOT NULL DEFAULT 0,
      extracts INTEGER NOT NULL DEFAULT 0,
      deaths INTEGER NOT NULL DEFAULT 0,
      hasUsedFreeLoadout BOOLEAN NOT NULL DEFAULT 0,
      hasFirstExtractRewarded BOOLEAN NOT NULL DEFAULT 0,
      activeTitleId INTEGER,
      cantinaLegend BOOLEAN NOT NULL DEFAULT 0,
      pingCount INTEGER NOT NULL DEFAULT 0,
      killsCredited INTEGER NOT NULL DEFAULT 0,
      deathsAttributed INTEGER NOT NULL DEFAULT 0,
      banned BOOLEAN NOT NULL DEFAULT 0
    )
  `);

  // Add banned column to existing users table if it doesn't exist (migration)
  try {
    db.exec(`ALTER TABLE users ADD COLUMN banned BOOLEAN NOT NULL DEFAULT 0`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Titles table
  db.exec(`
    CREATE TABLE IF NOT EXISTS titles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      tier TEXT NOT NULL,
      rank INTEGER NOT NULL,
      cost INTEGER NOT NULL,
      displayOrder INTEGER NOT NULL
    )
  `);

  // Owned titles
  db.exec(`
    CREATE TABLE IF NOT EXISTS owned_titles (
      userId INTEGER NOT NULL,
      titleId INTEGER NOT NULL,
      purchasedAt INTEGER NOT NULL,
      PRIMARY KEY (userId, titleId),
      FOREIGN KEY (userId) REFERENCES users(id),
      FOREIGN KEY (titleId) REFERENCES titles(id)
    )
  `);

  // Inventory
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      itemId TEXT NOT NULL,
      itemName TEXT NOT NULL,
      itemCategory TEXT NOT NULL,
      tier TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      sellValueCred INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (userId) REFERENCES users(id)
    )
  `);

  // Raids
  db.exec(`
    CREATE TABLE IF NOT EXISTS raids (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      startedAt INTEGER NOT NULL,
      endedAt INTEGER,
      mapName TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'IDLE'
    )
  `);

  // Raid participants
  db.exec(`
    CREATE TABLE IF NOT EXISTS raid_participants (
      raidId INTEGER NOT NULL,
      userId INTEGER NOT NULL,
      loadout TEXT NOT NULL,
      extracted BOOLEAN NOT NULL DEFAULT 0,
      creditsGained INTEGER NOT NULL DEFAULT 0,
      itemsJson TEXT,
      PRIMARY KEY (raidId, userId),
      FOREIGN KEY (raidId) REFERENCES raids(id),
      FOREIGN KEY (userId) REFERENCES users(id)
    )
  `);

  // Redemptions
  db.exec(`
    CREATE TABLE IF NOT EXISTS redemptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      type TEXT NOT NULL,
      cost INTEGER NOT NULL,
      createdAt INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      approvedBy TEXT,
      approvedAt INTEGER,
      completedAt INTEGER,
      customText TEXT,
      FOREIGN KEY (userId) REFERENCES users(id)
    )
  `);
  
  // Add customText column to existing redemptions table if it doesn't exist (migration)
  try {
    db.exec(`ALTER TABLE redemptions ADD COLUMN customText TEXT`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Kills (pairwise ledger)
  db.exec(`
    CREATE TABLE IF NOT EXISTS kills (
      killerUserId INTEGER NOT NULL,
      victimUserId INTEGER NOT NULL,
      count INTEGER NOT NULL DEFAULT 1,
      lastAt INTEGER NOT NULL,
      PRIMARY KEY (killerUserId, victimUserId),
      FOREIGN KEY (killerUserId) REFERENCES users(id),
      FOREIGN KEY (victimUserId) REFERENCES users(id)
    )
  `);

  // Kill events (history)
  db.exec(`
    CREATE TABLE IF NOT EXISTS kill_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      raidId INTEGER NOT NULL,
      killerUserId INTEGER NOT NULL,
      victimUserId INTEGER NOT NULL,
      createdAt INTEGER NOT NULL,
      FOREIGN KEY (raidId) REFERENCES raids(id),
      FOREIGN KEY (killerUserId) REFERENCES users(id),
      FOREIGN KEY (victimUserId) REFERENCES users(id)
    )
  `);

  // Maps cache
  db.exec(`
    CREATE TABLE IF NOT EXISTS maps_cache (
      name TEXT PRIMARY KEY,
      difficultyScalar REAL NOT NULL DEFAULT 1.0,
      encounterBias INTEGER NOT NULL DEFAULT 0,
      lastUpdated INTEGER NOT NULL
    )
  `);
}

export function seedTitles(db: Database.Database) {
  const titles = [
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

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO titles (name, tier, rank, cost, displayOrder)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const title of titles) {
    stmt.run(title.name, title.tier, title.rank, title.cost, title.displayOrder);
  }
}
