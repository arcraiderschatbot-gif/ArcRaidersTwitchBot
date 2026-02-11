import Database from 'better-sqlite3';
import { Client } from 'pg';
import deasync from 'deasync';
import { createSchema, seedTitles } from './schema';
import { createSchemaPg } from './pgSchema';

/** Run a Promise synchronously (for PostgreSQL in Repo so callers stay sync). */
function runSync<T>(p: Promise<T>): T {
  let result: T | undefined;
  let err: any;
  p.then((r) => { result = r; }).catch((e) => { err = e; });
  while (result === undefined && err === undefined) {
    deasync.sleep(10);
  }
  if (err) throw err;
  return result as T;
}

export class Repo {
  private db: Database.Database | null = null;
  private _pg: boolean = false;
  private pgClient: Client | null = null;

  constructor(dbPath: string, pgClient: Client | null = null) {
    if (pgClient) {
      this._pg = true;
      this.pgClient = pgClient;
      return;
    }
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    createSchema(this.db);
    seedTitles(this.db);
  }

  /** Create Repo: uses PostgreSQL when databaseUrl is set (e.g. Railway), else SQLite. */
  static async createRepo(dbPath: string, databaseUrl?: string): Promise<Repo> {
    if (databaseUrl && databaseUrl.trim().toLowerCase().startsWith('postgres')) {
      const client = new Client({ connectionString: databaseUrl });
      try {
        await client.connect();
        await createSchemaPg(client);
        console.log('ARC Raiders DB: Using PostgreSQL (persistent)');
        return new Repo(dbPath, client);
      } catch (e) {
        console.error('ARC Raiders DB: PostgreSQL connect failed:', e, '- falling back to SQLite');
        return new Repo(dbPath, null);
      }
    }
    if (databaseUrl) {
      console.log('ARC Raiders DB: No DATABASE_URL found, using SQLite (data not persistent on redeploy)');
    }
    return new Repo(dbPath, null);
  }

  // User operations
  createUser(twitchName: string, callsign: string): number {
    const now = Date.now();
    if (this._pg && this.pgClient) {
      const res = runSync(
        this.pgClient.query(
          `INSERT INTO users ("twitchName", callsign, "createdAt") VALUES ($1, $2, $3) RETURNING id`,
          [twitchName, callsign, now]
        )
      );
      return res.rows[0]?.id ?? 0;
    }
    const stmt = this.db!.prepare(`
      INSERT INTO users (twitchName, callsign, createdAt)
      VALUES (?, ?, ?)
    `);
    const result = stmt.run(twitchName, callsign, now);
    return Number(result.lastInsertRowid);
  }

  async createUserAsync(twitchName: string, callsign: string): Promise<number> {
    const now = Date.now();
    if (this._pg && this.pgClient) {
      const res = await this.pgClient.query(
        `INSERT INTO users ("twitchName", callsign, "createdAt") VALUES ($1, $2, $3) RETURNING id`,
        [twitchName, callsign, now]
      );
      return res.rows[0]?.id ?? 0;
    }
    const stmt = this.db!.prepare(`INSERT INTO users (twitchName, callsign, createdAt) VALUES (?, ?, ?)`);
    const result = stmt.run(twitchName, callsign, now);
    return Number(result.lastInsertRowid);
  }

  getUserByTwitchName(twitchName: string): any {
    if (this._pg && this.pgClient) {
      const res = runSync(this.pgClient.query('SELECT * FROM users WHERE "twitchName" = $1', [twitchName]));
      return res.rows[0] ?? null;
    }
    return this.db!.prepare('SELECT * FROM users WHERE twitchName = ?').get(twitchName) as any;
  }

  async getUserByTwitchNameAsync(twitchName: string): Promise<any> {
    if (this._pg && this.pgClient) {
      const res = await this.pgClient.query('SELECT * FROM users WHERE "twitchName" = $1', [twitchName]);
      return res.rows[0] ?? null;
    }
    return this.db!.prepare('SELECT * FROM users WHERE twitchName = ?').get(twitchName) as any;
  }

  getUserById(id: number): any {
    if (this._pg && this.pgClient) {
      const res = runSync(this.pgClient.query('SELECT * FROM users WHERE id = $1', [id]));
      return res.rows[0] ?? null;
    }
    return this.db!.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
  }

  async getUserByIdAsync(id: number): Promise<any> {
    if (this._pg && this.pgClient) {
      const res = await this.pgClient.query('SELECT * FROM users WHERE id = $1', [id]);
      return res.rows[0] ?? null;
    }
    return this.db!.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
  }

  updateUserCredits(userId: number, credits: number, lifetimeEarned: number, lifetimeSpent: number) {
    if (this._pg && this.pgClient) {
      runSync(this.pgClient.query(
        `UPDATE users SET credits = $1, "lifetimeCredEarned" = $2, "lifetimeCredSpent" = $3 WHERE id = $4`,
        [credits, lifetimeEarned, lifetimeSpent, userId]
      ));
      return;
    }
    this.db!.prepare(`
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
    pingCount?: number;
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
    if (stats.pingCount !== undefined) {
      updates.push('pingCount = ?');
      values.push(stats.pingCount);
    }

    if (updates.length > 0) {
      values.push(userId);
      if (this._pg && this.pgClient) {
        const setClause = updates.map((u, i) => u.replace('?', `$${i + 1}`)).join(', ');
        runSync(this.pgClient.query(`UPDATE users SET ${setClause} WHERE id = $${values.length}`, values));
        return;
      }
      this.db!.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }
  }

  setActiveTitle(userId: number, titleId: number | null) {
    if (this._pg && this.pgClient) {
      runSync(this.pgClient.query('UPDATE users SET "activeTitleId" = $1 WHERE id = $2', [titleId, userId]));
      return;
    }
    this.db!.prepare('UPDATE users SET activeTitleId = ? WHERE id = ?').run(titleId, userId);
  }

  // Ban operations
  banUser(userId: number): boolean {
    const user = this.getUserById(userId);
    if (!user) return false;
    if (this._pg && this.pgClient) {
      runSync(this.pgClient.query('UPDATE users SET banned = 1 WHERE id = $1', [userId]));
      return true;
    }
    this.db!.prepare('UPDATE users SET banned = 1 WHERE id = ?').run(userId);
    return true;
  }

  unbanUser(userId: number): boolean {
    const user = this.getUserById(userId);
    if (!user) return false;
    if (this._pg && this.pgClient) {
      runSync(this.pgClient.query('UPDATE users SET banned = 0 WHERE id = $1', [userId]));
      return true;
    }
    this.db!.prepare('UPDATE users SET banned = 0 WHERE id = ?').run(userId);
    return true;
  }

  banUserByTwitchName(twitchName: string): boolean {
    const user = this.getUserByTwitchName(twitchName);
    if (!user) return false;
    if (this._pg && this.pgClient) {
      runSync(this.pgClient.query('UPDATE users SET banned = 1 WHERE "twitchName" = $1', [twitchName]));
      return true;
    }
    this.db!.prepare('UPDATE users SET banned = 1 WHERE twitchName = ?').run(twitchName);
    return true;
  }

  unbanUserByTwitchName(twitchName: string): boolean {
    const user = this.getUserByTwitchName(twitchName);
    if (!user) return false;
    if (this._pg && this.pgClient) {
      runSync(this.pgClient.query('UPDATE users SET banned = 0 WHERE "twitchName" = $1', [twitchName]));
      return true;
    }
    this.db!.prepare('UPDATE users SET banned = 0 WHERE twitchName = ?').run(twitchName);
    return true;
  }

  isBanned(userId: number): boolean {
    const user = this.getUserById(userId);
    return user ? (user.banned === 1 || user.banned === true) : false;
  }

  // Admin: Reset all users and their associated data
  resetAllUsers(): { deletedUsers: number; deletedInventory: number; deletedTitles: number; deletedRedemptions: number; deletedKills: number } {
    if (this._pg && this.pgClient) {
      const getCount = (table: string) =>
        runSync(this.pgClient!.query(`SELECT COUNT(*) as count FROM ${table}`)).rows[0]?.count ?? 0;
      const userCount = getCount('users');
      const inventoryCount = getCount('inventory');
      const titlesCount = getCount('owned_titles');
      const redemptionsCount = getCount('redemptions');
      const killsCount = getCount('kills');
      runSync(this.pgClient.query('DELETE FROM kill_events'));
      runSync(this.pgClient.query('DELETE FROM kills'));
      runSync(this.pgClient.query('DELETE FROM inventory'));
      runSync(this.pgClient.query('DELETE FROM owned_titles'));
      runSync(this.pgClient.query('DELETE FROM redemptions'));
      runSync(this.pgClient.query('DELETE FROM raid_participants'));
      runSync(this.pgClient.query('DELETE FROM users'));
      return { deletedUsers: userCount, deletedInventory: inventoryCount, deletedTitles: titlesCount, deletedRedemptions: redemptionsCount, deletedKills: killsCount };
    }
    const userCount = (this.db!.prepare('SELECT COUNT(*) as count FROM users').get() as any)?.count || 0;
    const inventoryCount = (this.db!.prepare('SELECT COUNT(*) as count FROM inventory').get() as any)?.count || 0;
    const titlesCount = (this.db!.prepare('SELECT COUNT(*) as count FROM owned_titles').get() as any)?.count || 0;
    const redemptionsCount = (this.db!.prepare('SELECT COUNT(*) as count FROM redemptions').get() as any)?.count || 0;
    const killsCount = (this.db!.prepare('SELECT COUNT(*) as count FROM kills').get() as any)?.count || 0;
    this.db!.exec('DELETE FROM kill_events');
    this.db!.exec('DELETE FROM kills');
    this.db!.exec('DELETE FROM inventory');
    this.db!.exec('DELETE FROM owned_titles');
    this.db!.exec('DELETE FROM redemptions');
    this.db!.exec('DELETE FROM raid_participants');
    this.db!.exec('DELETE FROM users');
    return { deletedUsers: userCount, deletedInventory: inventoryCount, deletedTitles: titlesCount, deletedRedemptions: redemptionsCount, deletedKills: killsCount };
  }

  // Admin: Reset all game data (users, raids, redemptions, kills, etc.)
  resetAllGameData(): { deletedUsers: number; deletedRaids: number; deletedRedemptions: number } {
    if (this._pg && this.pgClient) {
      const userCount = runSync(this.pgClient.query('SELECT COUNT(*) as count FROM users')).rows[0]?.count ?? 0;
      const raidsCount = runSync(this.pgClient.query('SELECT COUNT(*) as count FROM raids')).rows[0]?.count ?? 0;
      const redemptionsCount = runSync(this.pgClient.query('SELECT COUNT(*) as count FROM redemptions')).rows[0]?.count ?? 0;
      runSync(this.pgClient.query('DELETE FROM kill_events'));
      runSync(this.pgClient.query('DELETE FROM kills'));
      runSync(this.pgClient.query('DELETE FROM inventory'));
      runSync(this.pgClient.query('DELETE FROM owned_titles'));
      runSync(this.pgClient.query('DELETE FROM redemptions'));
      runSync(this.pgClient.query('DELETE FROM raid_participants'));
      runSync(this.pgClient.query('DELETE FROM raids'));
      runSync(this.pgClient.query('DELETE FROM users'));
      runSync(this.pgClient.query('DELETE FROM maps_cache'));
      return { deletedUsers: userCount, deletedRaids: raidsCount, deletedRedemptions: redemptionsCount };
    }
    const userCount = (this.db!.prepare('SELECT COUNT(*) as count FROM users').get() as any)?.count || 0;
    const raidsCount = (this.db!.prepare('SELECT COUNT(*) as count FROM raids').get() as any)?.count || 0;
    const redemptionsCount = (this.db!.prepare('SELECT COUNT(*) as count FROM redemptions').get() as any)?.count || 0;
    this.db!.exec('DELETE FROM kill_events');
    this.db!.exec('DELETE FROM kills');
    this.db!.exec('DELETE FROM inventory');
    this.db!.exec('DELETE FROM owned_titles');
    this.db!.exec('DELETE FROM redemptions');
    this.db!.exec('DELETE FROM raid_participants');
    this.db!.exec('DELETE FROM raids');
    this.db!.exec('DELETE FROM users');
    this.db!.exec('DELETE FROM maps_cache');
    return { deletedUsers: userCount, deletedRaids: raidsCount, deletedRedemptions: redemptionsCount };
  }

  // Title operations
  getTitleById(id: number): any {
    if (this._pg && this.pgClient) {
      const res = runSync(this.pgClient.query('SELECT * FROM titles WHERE id = $1', [id]));
      return res.rows[0] ?? null;
    }
    return this.db!.prepare('SELECT * FROM titles WHERE id = ?').get(id) as any;
  }

  getAllTitles(): any[] {
    if (this._pg && this.pgClient) {
      const res = runSync(this.pgClient.query('SELECT * FROM titles ORDER BY "displayOrder"'));
      return res.rows;
    }
    return this.db!.prepare('SELECT * FROM titles ORDER BY displayOrder').all() as any[];
  }

  getNextTitleForUser(userId: number): any {
    const user = this.getUserById(userId);
    if (!user) return null;
    if (this._pg && this.pgClient) {
      const ownedRes = runSync(this.pgClient.query('SELECT "titleId" FROM owned_titles WHERE "userId" = $1', [userId]));
      const ownedIds = new Set((ownedRes.rows as { titleId: number }[]).map((t) => t.titleId));
      const allTitles = this.getAllTitles();
      for (const title of allTitles) {
        if (!ownedIds.has(title.id)) return title;
      }
      return null;
    }
    const ownedTitles = this.db!.prepare('SELECT titleId FROM owned_titles WHERE userId = ?').all(userId) as { titleId: number }[];
    const ownedIds = new Set(ownedTitles.map((t) => t.titleId));
    const allTitles = this.getAllTitles();
    for (const title of allTitles) {
      if (!ownedIds.has(title.id)) return title;
    }
    return null;
  }

  purchaseTitle(userId: number, titleId: number) {
    const now = Date.now();
    if (this._pg && this.pgClient) {
      runSync(this.pgClient.query('INSERT INTO owned_titles ("userId", "titleId", "purchasedAt") VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [userId, titleId, now]));
      return;
    }
    this.db!.prepare('INSERT INTO owned_titles (userId, titleId, purchasedAt) VALUES (?, ?, ?)').run(userId, titleId, now);
  }

  getUserTitles(userId: number): any[] {
    if (this._pg && this.pgClient) {
      const res = runSync(this.pgClient.query(`
        SELECT t.*, ot."purchasedAt" FROM titles t
        INNER JOIN owned_titles ot ON t.id = ot."titleId" WHERE ot."userId" = $1
        ORDER BY t."displayOrder"
      `, [userId]));
      return res.rows;
    }
    return this.db!.prepare(`
      SELECT t.*, ot.purchasedAt FROM titles t
      INNER JOIN owned_titles ot ON t.id = ot.titleId WHERE ot.userId = ?
      ORDER BY t.displayOrder
    `).all(userId) as any[];
  }

  // Inventory operations
  addItem(userId: number, item: { id: string; name: string; category: string; tier: string; sellValueCred: number }, quantity: number = 1) {
    if (this._pg && this.pgClient) {
      const existing = runSync(this.pgClient.query('SELECT * FROM inventory WHERE "userId" = $1 AND "itemId" = $2', [userId, item.id])).rows[0];
      if (existing) {
        runSync(this.pgClient.query('UPDATE inventory SET quantity = quantity + $1 WHERE id = $2', [quantity, existing.id]));
      } else {
        runSync(this.pgClient.query(
          'INSERT INTO inventory ("userId", "itemId", "itemName", "itemCategory", tier, quantity, "sellValueCred") VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [userId, item.id, item.name, item.category, item.tier, quantity, item.sellValueCred]
        ));
      }
      return;
    }
    const existing = this.db!.prepare('SELECT * FROM inventory WHERE userId = ? AND itemId = ?').get(userId, item.id) as any;
    if (existing) {
      this.db!.prepare('UPDATE inventory SET quantity = quantity + ? WHERE id = ?').run(quantity, existing.id);
    } else {
      this.db!.prepare('INSERT INTO inventory (userId, itemId, itemName, itemCategory, tier, quantity, sellValueCred) VALUES (?, ?, ?, ?, ?, ?, ?)').run(userId, item.id, item.name, item.category, item.tier, quantity, item.sellValueCred);
    }
  }

  getUserInventory(userId: number): any[] {
    if (this._pg && this.pgClient) {
      const res = runSync(this.pgClient.query('SELECT * FROM inventory WHERE "userId" = $1 AND quantity > 0 ORDER BY tier DESC, "itemName" ASC', [userId]));
      return res.rows;
    }
    return this.db!.prepare('SELECT * FROM inventory WHERE userId = ? AND quantity > 0 ORDER BY tier DESC, itemName ASC').all(userId) as any[];
  }

  clearInventory(userId: number) {
    if (this._pg && this.pgClient) {
      runSync(this.pgClient.query('DELETE FROM inventory WHERE "userId" = $1', [userId]));
      return;
    }
    this.db!.prepare('DELETE FROM inventory WHERE userId = ?').run(userId);
  }

  // Raid operations
  createRaid(mapName: string): number {
    const now = Date.now();
    if (this._pg && this.pgClient) {
      const res = runSync(this.pgClient.query('INSERT INTO raids ("startedAt", "mapName", state) VALUES ($1, $2, \'OPEN\') RETURNING id', [now, mapName]));
      return res.rows[0]?.id ?? 0;
    }
    const result = this.db!.prepare('INSERT INTO raids (startedAt, mapName, state) VALUES (?, ?, \'OPEN\')').run(now, mapName);
    return Number(result.lastInsertRowid);
  }

  getCurrentRaid(): any {
    if (this._pg && this.pgClient) {
      const res = runSync(this.pgClient.query('SELECT * FROM raids WHERE state = \'OPEN\' ORDER BY "startedAt" DESC LIMIT 1'));
      return res.rows[0] ?? null;
    }
    return this.db!.prepare('SELECT * FROM raids WHERE state = \'OPEN\' ORDER BY startedAt DESC LIMIT 1').get() as any;
  }

  updateRaidState(raidId: number, state: string, endedAt?: number) {
    if (this._pg && this.pgClient) {
      if (endedAt != null) runSync(this.pgClient.query('UPDATE raids SET state = $1, "endedAt" = $2 WHERE id = $3', [state, endedAt, raidId]));
      else runSync(this.pgClient.query('UPDATE raids SET state = $1 WHERE id = $2', [state, raidId]));
      return;
    }
    if (endedAt != null) this.db!.prepare('UPDATE raids SET state = ?, endedAt = ? WHERE id = ?').run(state, endedAt, raidId);
    else this.db!.prepare('UPDATE raids SET state = ? WHERE id = ?').run(state, raidId);
  }

  addRaidParticipant(raidId: number, userId: number, loadout: string) {
    if (this._pg && this.pgClient) {
      runSync(this.pgClient.query('INSERT INTO raid_participants ("raidId", "userId", loadout) VALUES ($1, $2, $3) ON CONFLICT ("raidId", "userId") DO UPDATE SET loadout = EXCLUDED.loadout', [raidId, userId, loadout]));
      return;
    }
    this.db!.prepare('INSERT OR REPLACE INTO raid_participants (raidId, userId, loadout) VALUES (?, ?, ?)').run(raidId, userId, loadout);
  }

  updateRaidParticipant(raidId: number, userId: number, extracted: boolean, creditsGained: number, itemsJson: string) {
    if (this._pg && this.pgClient) {
      runSync(this.pgClient.query('UPDATE raid_participants SET extracted = $1, "creditsGained" = $2, "itemsJson" = $3 WHERE "raidId" = $4 AND "userId" = $5', [extracted ? 1 : 0, creditsGained, itemsJson ?? '[]', raidId, userId]));
      return;
    }
    this.db!.prepare('UPDATE raid_participants SET extracted = ?, creditsGained = ?, itemsJson = ? WHERE raidId = ? AND userId = ?').run(extracted ? 1 : 0, creditsGained, itemsJson, raidId, userId);
  }

  getRaidParticipants(raidId: number): any[] {
    if (this._pg && this.pgClient) {
      const res = runSync(this.pgClient.query(`
        SELECT rp.*, u."twitchName" as "twitchName", u.callsign
        FROM raid_participants rp INNER JOIN users u ON rp."userId" = u.id WHERE rp."raidId" = $1
      `, [raidId]));
      return res.rows;
    }
    return this.db!.prepare('SELECT rp.*, u.twitchName, u.callsign FROM raid_participants rp INNER JOIN users u ON rp.userId = u.id WHERE rp.raidId = ?').all(raidId) as any[];
  }

  // Redemption operations
  createRedemption(userId: number, type: string, cost: number, customText?: string): number {
    const now = Date.now();
    if (this._pg && this.pgClient) {
      const res = runSync(this.pgClient.query(
        'INSERT INTO redemptions ("userId", type, cost, "createdAt", status, "customText") VALUES ($1, $2, $3, $4, \'pending\', $5) RETURNING id',
        [userId, type, cost, now, customText ?? null]
      ));
      return res.rows[0]?.id ?? 0;
    }
    const result = this.db!.prepare('INSERT INTO redemptions (userId, type, cost, createdAt, status, customText) VALUES (?, ?, ?, ?, \'pending\', ?)').run(userId, type, cost, now, customText || null);
    return Number(result.lastInsertRowid);
  }

  getRedemption(id: number): any {
    if (this._pg && this.pgClient) {
      const res = runSync(this.pgClient.query('SELECT * FROM redemptions WHERE id = $1', [id]));
      return res.rows[0] ?? null;
    }
    return this.db!.prepare('SELECT * FROM redemptions WHERE id = ?').get(id) as any;
  }

  getPendingRedemptions(): any[] {
    if (this._pg && this.pgClient) {
      const res = runSync(this.pgClient.query(`
        SELECT r.*, u."twitchName" as "twitchName", u.callsign
        FROM redemptions r INNER JOIN users u ON r."userId" = u.id WHERE r.status = 'pending' ORDER BY r."createdAt" ASC
      `));
      return res.rows;
    }
    return this.db!.prepare('SELECT r.*, u.twitchName, u.callsign FROM redemptions r INNER JOIN users u ON r.userId = u.id WHERE r.status = \'pending\' ORDER BY r.createdAt ASC').all() as any[];
  }

  approveRedemption(id: number, approvedBy: string) {
    const now = Date.now();
    if (this._pg && this.pgClient) {
      runSync(this.pgClient.query('UPDATE redemptions SET status = \'approved\', "approvedBy" = $1, "approvedAt" = $2 WHERE id = $3', [approvedBy, now, id]));
      return;
    }
    this.db!.prepare('UPDATE redemptions SET status = \'approved\', approvedBy = ?, approvedAt = ? WHERE id = ?').run(approvedBy, now, id);
  }

  denyRedemption(id: number) {
    if (this._pg && this.pgClient) {
      runSync(this.pgClient.query('UPDATE redemptions SET status = \'denied\' WHERE id = $1', [id]));
      return;
    }
    this.db!.prepare('UPDATE redemptions SET status = \'denied\' WHERE id = ?').run(id);
  }

  completeRedemption(id: number) {
    const now = Date.now();
    if (this._pg && this.pgClient) {
      runSync(this.pgClient.query('UPDATE redemptions SET status = \'completed\', "completedAt" = $1 WHERE id = $2', [now, id]));
      return;
    }
    this.db!.prepare('UPDATE redemptions SET status = \'completed\', completedAt = ? WHERE id = ?').run(now, id);
  }

  // Kill operations
  recordKill(killerUserId: number, victimUserId: number, raidId: number) {
    const now = Date.now();
    if (this._pg && this.pgClient) {
      const existing = runSync(this.pgClient.query('SELECT * FROM kills WHERE "killerUserId" = $1 AND "victimUserId" = $2', [killerUserId, victimUserId])).rows[0];
      if (existing) {
        runSync(this.pgClient.query('UPDATE kills SET count = count + 1, "lastAt" = $1 WHERE "killerUserId" = $2 AND "victimUserId" = $3', [now, killerUserId, victimUserId]));
      } else {
        runSync(this.pgClient.query('INSERT INTO kills ("killerUserId", "victimUserId", count, "lastAt") VALUES ($1, $2, 1, $3)', [killerUserId, victimUserId, now]));
      }
      runSync(this.pgClient.query('INSERT INTO kill_events ("raidId", "killerUserId", "victimUserId", "createdAt") VALUES ($1, $2, $3, $4)', [raidId, killerUserId, victimUserId, now]));
      return;
    }
    const trans = this.db!.transaction(() => {
      const existing = this.db!.prepare('SELECT * FROM kills WHERE killerUserId = ? AND victimUserId = ?').get(killerUserId, victimUserId) as any;
      if (existing) {
        this.db!.prepare('UPDATE kills SET count = count + 1, lastAt = ? WHERE killerUserId = ? AND victimUserId = ?').run(now, killerUserId, victimUserId);
      } else {
        this.db!.prepare('INSERT INTO kills (killerUserId, victimUserId, count, lastAt) VALUES (?, ?, 1, ?)').run(killerUserId, victimUserId, now);
      }
      this.db!.prepare('INSERT INTO kill_events (raidId, killerUserId, victimUserId, createdAt) VALUES (?, ?, ?, ?)').run(raidId, killerUserId, victimUserId, now);
    });
    trans();
  }

  getKillStats(userId: number): { kills: any[]; deaths: any[] } {
    if (this._pg && this.pgClient) {
      const kills = runSync(this.pgClient.query(`
        SELECT "victimUserId", count, u."twitchName", u.callsign FROM kills
        INNER JOIN users u ON kills."victimUserId" = u.id WHERE kills."killerUserId" = $1 ORDER BY count DESC
      `, [userId])).rows;
      const deaths = runSync(this.pgClient.query(`
        SELECT "killerUserId", count, u."twitchName", u.callsign FROM kills
        INNER JOIN users u ON kills."killerUserId" = u.id WHERE kills."victimUserId" = $1 ORDER BY count DESC
      `, [userId])).rows;
      return { kills, deaths };
    }
    const kills = this.db!.prepare('SELECT victimUserId, count, u.twitchName, u.callsign FROM kills INNER JOIN users u ON kills.victimUserId = u.id WHERE killerUserId = ? ORDER BY count DESC').all(userId) as any[];
    const deaths = this.db!.prepare('SELECT killerUserId, count, u.twitchName, u.callsign FROM kills INNER JOIN users u ON kills.killerUserId = u.id WHERE victimUserId = ? ORDER BY count DESC').all(userId) as any[];
    return { kills, deaths };
  }

  getHeadToHead(userId1: number, userId2: number): { user1Kills: number; user2Kills: number } {
    if (this._pg && this.pgClient) {
      const k1 = runSync(this.pgClient.query('SELECT count FROM kills WHERE "killerUserId" = $1 AND "victimUserId" = $2', [userId1, userId2])).rows[0];
      const k2 = runSync(this.pgClient.query('SELECT count FROM kills WHERE "killerUserId" = $1 AND "victimUserId" = $2', [userId2, userId1])).rows[0];
      return { user1Kills: k1?.count ?? 0, user2Kills: k2?.count ?? 0 };
    }
    const k1 = this.db!.prepare('SELECT count FROM kills WHERE killerUserId = ? AND victimUserId = ?').get(userId1, userId2) as { count: number } | undefined;
    const k2 = this.db!.prepare('SELECT count FROM kills WHERE killerUserId = ? AND victimUserId = ?').get(userId2, userId1) as { count: number } | undefined;
    return { user1Kills: k1?.count ?? 0, user2Kills: k2?.count ?? 0 };
  }

  getRecentKillFeed(userId: number, limit: number = 5): any[] {
    if (this._pg && this.pgClient) {
      const res = runSync(this.pgClient.query(`
        SELECT ke.*, k."twitchName" as "killerName", k.callsign as "killerCallsign", v."twitchName" as "victimName", v.callsign as "victimCallsign"
        FROM kill_events ke INNER JOIN users k ON ke."killerUserId" = k.id INNER JOIN users v ON ke."victimUserId" = v.id
        WHERE ke."killerUserId" = $1 OR ke."victimUserId" = $2 ORDER BY ke."createdAt" DESC LIMIT $3
      `, [userId, userId, limit]));
      return res.rows;
    }
    return this.db!.prepare(`
      SELECT ke.*, k.twitchName as killerName, k.callsign as killerCallsign, v.twitchName as victimName, v.callsign as victimCallsign
      FROM kill_events ke INNER JOIN users k ON ke.killerUserId = k.id INNER JOIN users v ON ke.victimUserId = v.id
      WHERE ke.killerUserId = ? OR ke.victimUserId = ? ORDER BY ke.createdAt DESC LIMIT ?
    `).all(userId, userId, limit) as any[];
  }

  // Maps cache
  updateMapCache(name: string, difficultyScalar: number, encounterBias: number) {
    const now = Date.now();
    if (this._pg && this.pgClient) {
      runSync(this.pgClient.query(`
        INSERT INTO maps_cache (name, "difficultyScalar", "encounterBias", "lastUpdated") VALUES ($1, $2, $3, $4)
        ON CONFLICT (name) DO UPDATE SET "difficultyScalar" = EXCLUDED."difficultyScalar", "encounterBias" = EXCLUDED."encounterBias", "lastUpdated" = EXCLUDED."lastUpdated"
      `, [name, difficultyScalar, encounterBias, now]));
      return;
    }
    this.db!.prepare('INSERT OR REPLACE INTO maps_cache (name, difficultyScalar, encounterBias, lastUpdated) VALUES (?, ?, ?, ?)').run(name, difficultyScalar, encounterBias, now);
  }

  getMapCache(name: string): any {
    if (this._pg && this.pgClient) {
      const res = runSync(this.pgClient.query('SELECT * FROM maps_cache WHERE name = $1', [name]));
      return res.rows[0] ?? null;
    }
    return this.db!.prepare('SELECT * FROM maps_cache WHERE name = ?').get(name) as any;
  }

  getAllMaps(): any[] {
    if (this._pg && this.pgClient) {
      const res = runSync(this.pgClient.query('SELECT * FROM maps_cache ORDER BY name'));
      return res.rows;
    }
    return this.db!.prepare('SELECT * FROM maps_cache ORDER BY name').all() as any[];
  }

  getRaidCount(): number {
    if (this._pg && this.pgClient) {
      const res = runSync(this.pgClient.query('SELECT COUNT(*) as count FROM raids'));
      return Number(res.rows[0]?.count ?? 0);
    }
    const result = this.db!.prepare('SELECT COUNT(*) as count FROM raids').get() as { count: number };
    return result?.count ?? 0;
  }

  close() {
    if (this.pgClient) {
      this.pgClient.end();
      this.pgClient = null;
      return;
    }
    this.db?.close();
  }
}
