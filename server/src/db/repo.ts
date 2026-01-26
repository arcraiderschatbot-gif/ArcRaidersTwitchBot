import Database from 'better-sqlite3';
import { createSchema, seedTitles } from './schema';

export class Repo {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    createSchema(this.db);
    seedTitles(this.db);
  }

  // User operations
  createUser(twitchName: string, callsign: string): number {
    const stmt = this.db.prepare(`
      INSERT INTO users (twitchName, callsign, createdAt)
      VALUES (?, ?, ?)
    `);
    const result = stmt.run(twitchName, callsign, Date.now());
    return Number(result.lastInsertRowid);
  }

  getUserByTwitchName(twitchName: string) {
    return this.db.prepare('SELECT * FROM users WHERE twitchName = ?').get(twitchName) as any;
  }

  getUserById(id: number) {
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
  }

  updateUserCredits(userId: number, credits: number, lifetimeEarned: number, lifetimeSpent: number) {
    this.db.prepare(`
      UPDATE users
      SET credits = ?, lifetimeCredEarned = ?, lifetimeCredSpent = ?
      WHERE id = ?
    `).run(credits, lifetimeEarned, lifetimeSpent, userId);
  }

  updateUserStats(userId: number, stats: {
    raidsPlayed?: number;
    extracts?: number;
    deaths?: number;
    hasUsedFreeLoadout?: boolean;
    hasFirstExtractRewarded?: boolean;
    killsCredited?: number;
    deathsAttributed?: number;
  }) {
    const updates: string[] = [];
    const values: any[] = [];

    if (stats.raidsPlayed !== undefined) {
      updates.push('raidsPlayed = ?');
      values.push(stats.raidsPlayed);
    }
    if (stats.extracts !== undefined) {
      updates.push('extracts = ?');
      values.push(stats.extracts);
    }
    if (stats.deaths !== undefined) {
      updates.push('deaths = ?');
      values.push(stats.deaths);
    }
    if (stats.hasUsedFreeLoadout !== undefined) {
      updates.push('hasUsedFreeLoadout = ?');
      values.push(stats.hasUsedFreeLoadout ? 1 : 0);
    }
    if (stats.hasFirstExtractRewarded !== undefined) {
      updates.push('hasFirstExtractRewarded = ?');
      values.push(stats.hasFirstExtractRewarded ? 1 : 0);
    }
    if (stats.killsCredited !== undefined) {
      updates.push('killsCredited = ?');
      values.push(stats.killsCredited);
    }
    if (stats.deathsAttributed !== undefined) {
      updates.push('deathsAttributed = ?');
      values.push(stats.deathsAttributed);
    }

    if (updates.length > 0) {
      values.push(userId);
      this.db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }
  }

  setActiveTitle(userId: number, titleId: number | null) {
    this.db.prepare('UPDATE users SET activeTitleId = ? WHERE id = ?').run(titleId, userId);
  }

  // Title operations
  getTitleById(id: number) {
    return this.db.prepare('SELECT * FROM titles WHERE id = ?').get(id) as any;
  }

  getAllTitles() {
    return this.db.prepare('SELECT * FROM titles ORDER BY displayOrder').all() as any[];
  }

  getNextTitleForUser(userId: number) {
    const user = this.getUserById(userId);
    if (!user) return null;

    const ownedTitles = this.db.prepare(`
      SELECT titleId FROM owned_titles WHERE userId = ?
    `).all(userId) as { titleId: number }[];

    const ownedIds = new Set(ownedTitles.map(t => t.titleId));
    const allTitles = this.getAllTitles();

    // Find first title not owned
    for (const title of allTitles) {
      if (!ownedIds.has(title.id)) {
        return title;
      }
    }
    return null;
  }

  purchaseTitle(userId: number, titleId: number) {
    const trans = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO owned_titles (userId, titleId, purchasedAt)
        VALUES (?, ?, ?)
      `).run(userId, titleId, Date.now());
    });
    trans();
  }

  getUserTitles(userId: number) {
    return this.db.prepare(`
      SELECT t.*, ot.purchasedAt
      FROM titles t
      INNER JOIN owned_titles ot ON t.id = ot.titleId
      WHERE ot.userId = ?
      ORDER BY t.displayOrder
    `).all(userId) as any[];
  }

  // Inventory operations
  addItem(userId: number, item: { id: string; name: string; category: string; tier: string; sellValueCred: number }, quantity: number = 1) {
    const existing = this.db.prepare(`
      SELECT * FROM inventory
      WHERE userId = ? AND itemId = ?
    `).get(userId, item.id) as any;

    if (existing) {
      this.db.prepare(`
        UPDATE inventory SET quantity = quantity + ? WHERE id = ?
      `).run(quantity, existing.id);
    } else {
      this.db.prepare(`
        INSERT INTO inventory (userId, itemId, itemName, itemCategory, tier, quantity, sellValueCred)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(userId, item.id, item.name, item.category, item.tier, quantity, item.sellValueCred);
    }
  }

  getUserInventory(userId: number) {
    return this.db.prepare(`
      SELECT * FROM inventory WHERE userId = ? AND quantity > 0
      ORDER BY tier DESC, itemName ASC
    `).all(userId) as any[];
  }

  clearInventory(userId: number) {
    this.db.prepare('DELETE FROM inventory WHERE userId = ?').run(userId);
  }

  // Raid operations
  createRaid(mapName: string): number {
    const stmt = this.db.prepare(`
      INSERT INTO raids (startedAt, mapName, state)
      VALUES (?, ?, 'OPEN')
    `);
    const result = stmt.run(Date.now(), mapName);
    return Number(result.lastInsertRowid);
  }

  getCurrentRaid() {
    return this.db.prepare(`
      SELECT * FROM raids WHERE state = 'OPEN' ORDER BY startedAt DESC LIMIT 1
    `).get() as any;
  }

  updateRaidState(raidId: number, state: string, endedAt?: number) {
    if (endedAt) {
      this.db.prepare('UPDATE raids SET state = ?, endedAt = ? WHERE id = ?').run(state, endedAt, raidId);
    } else {
      this.db.prepare('UPDATE raids SET state = ? WHERE id = ?').run(state, raidId);
    }
  }

  addRaidParticipant(raidId: number, userId: number, loadout: string) {
    this.db.prepare(`
      INSERT OR IGNORE INTO raid_participants (raidId, userId, loadout)
      VALUES (?, ?, ?)
    `).run(raidId, userId, loadout);
  }

  updateRaidParticipant(raidId: number, userId: number, extracted: boolean, creditsGained: number, itemsJson: string) {
    this.db.prepare(`
      UPDATE raid_participants
      SET extracted = ?, creditsGained = ?, itemsJson = ?
      WHERE raidId = ? AND userId = ?
    `).run(extracted ? 1 : 0, creditsGained, itemsJson, raidId, userId);
  }

  getRaidParticipants(raidId: number) {
    return this.db.prepare(`
      SELECT rp.*, u.twitchName, u.callsign
      FROM raid_participants rp
      INNER JOIN users u ON rp.userId = u.id
      WHERE rp.raidId = ?
    `).all(raidId) as any[];
  }

  // Redemption operations
  createRedemption(userId: number, type: string, cost: number): number {
    const stmt = this.db.prepare(`
      INSERT INTO redemptions (userId, type, cost, createdAt, status)
      VALUES (?, ?, ?, ?, 'pending')
    `);
    const result = stmt.run(userId, type, cost, Date.now());
    return Number(result.lastInsertRowid);
  }

  getRedemption(id: number) {
    return this.db.prepare('SELECT * FROM redemptions WHERE id = ?').get(id) as any;
  }

  getPendingRedemptions() {
    return this.db.prepare(`
      SELECT r.*, u.twitchName, u.callsign
      FROM redemptions r
      INNER JOIN users u ON r.userId = u.id
      WHERE r.status = 'pending'
      ORDER BY r.createdAt ASC
    `).all() as any[];
  }

  approveRedemption(id: number, approvedBy: string) {
    this.db.prepare(`
      UPDATE redemptions
      SET status = 'approved', approvedBy = ?, approvedAt = ?
      WHERE id = ?
    `).run(approvedBy, Date.now(), id);
  }

  denyRedemption(id: number) {
    this.db.prepare(`
      UPDATE redemptions
      SET status = 'denied'
      WHERE id = ?
    `).run(id);
  }

  completeRedemption(id: number) {
    this.db.prepare(`
      UPDATE redemptions
      SET status = 'completed', completedAt = ?
      WHERE id = ?
    `).run(Date.now(), id);
  }

  // Kill operations
  recordKill(killerUserId: number, victimUserId: number, raidId: number) {
    const trans = this.db.transaction(() => {
      // Update or insert kill ledger
      const existing = this.db.prepare(`
        SELECT * FROM kills WHERE killerUserId = ? AND victimUserId = ?
      `).get(killerUserId, victimUserId) as any;

      if (existing) {
        this.db.prepare(`
          UPDATE kills SET count = count + 1, lastAt = ? WHERE killerUserId = ? AND victimUserId = ?
        `).run(Date.now(), killerUserId, victimUserId);
      } else {
        this.db.prepare(`
          INSERT INTO kills (killerUserId, victimUserId, count, lastAt)
          VALUES (?, ?, 1, ?)
        `).run(killerUserId, victimUserId, Date.now());
      }

      // Record kill event
      this.db.prepare(`
        INSERT INTO kill_events (raidId, killerUserId, victimUserId, createdAt)
        VALUES (?, ?, ?, ?)
      `).run(raidId, killerUserId, victimUserId, Date.now());
    });
    trans();
  }

  getKillStats(userId: number) {
    const kills = this.db.prepare(`
      SELECT victimUserId, count, u.twitchName, u.callsign
      FROM kills
      INNER JOIN users u ON kills.victimUserId = u.id
      WHERE killerUserId = ?
      ORDER BY count DESC
    `).all(userId) as any[];

    const deaths = this.db.prepare(`
      SELECT killerUserId, count, u.twitchName, u.callsign
      FROM kills
      INNER JOIN users u ON kills.killerUserId = u.id
      WHERE victimUserId = ?
      ORDER BY count DESC
    `).all(userId) as any[];

    return { kills, deaths };
  }

  getHeadToHead(userId1: number, userId2: number) {
    const k1 = this.db.prepare(`
      SELECT count FROM kills WHERE killerUserId = ? AND victimUserId = ?
    `).get(userId1, userId2) as { count: number } | undefined;

    const k2 = this.db.prepare(`
      SELECT count FROM kills WHERE killerUserId = ? AND victimUserId = ?
    `).get(userId2, userId1) as { count: number } | undefined;

    return {
      user1Kills: k1?.count || 0,
      user2Kills: k2?.count || 0,
    };
  }

  getRecentKillFeed(userId: number, limit: number = 5) {
    return this.db.prepare(`
      SELECT ke.*, 
        k.twitchName as killerName, k.callsign as killerCallsign,
        v.twitchName as victimName, v.callsign as victimCallsign
      FROM kill_events ke
      INNER JOIN users k ON ke.killerUserId = k.id
      INNER JOIN users v ON ke.victimUserId = v.id
      WHERE ke.killerUserId = ? OR ke.victimUserId = ?
      ORDER BY ke.createdAt DESC
      LIMIT ?
    `).all(userId, userId, limit) as any[];
  }

  // Maps cache
  updateMapCache(name: string, difficultyScalar: number, encounterBias: number) {
    this.db.prepare(`
      INSERT OR REPLACE INTO maps_cache (name, difficultyScalar, encounterBias, lastUpdated)
      VALUES (?, ?, ?, ?)
    `).run(name, difficultyScalar, encounterBias, Date.now());
  }

  getMapCache(name: string) {
    return this.db.prepare('SELECT * FROM maps_cache WHERE name = ?').get(name) as any;
  }

  getAllMaps() {
    return this.db.prepare('SELECT * FROM maps_cache ORDER BY name').all() as any[];
  }

  getRaidCount(): number {
    const result = this.db.prepare('SELECT COUNT(*) as count FROM raids').get() as { count: number };
    return result.count || 0;
  }

  close() {
    this.db.close();
  }
}
