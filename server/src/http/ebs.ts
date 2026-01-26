import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { Repo } from '../db/repo';
import { Config } from '../config';
import { RaidScheduler } from '../game/raidScheduler';
import { Economy } from '../game/economy';
import { CashInSystem } from '../game/cashin';
import { TitlesSystem } from '../game/titles';
import { VendettaSystem } from '../game/vendetta';

export function createEBS(
  repo: Repo,
  config: Config,
  raidScheduler: RaidScheduler,
  economy: Economy,
  cashInSystem: CashInSystem,
  titlesSystem: TitlesSystem,
  vendettaSystem: VendettaSystem
) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Validate extension JWT
  function validateExtensionJWT(req: express.Request, res: express.Response, next: express.NextFunction) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    try {
      const decoded = jwt.verify(token, Buffer.from(config.extension.secret, 'base64')) as any;
      req.user = decoded;
      next();
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  }

  // Public endpoints
  app.get('/api/public/profile/:twitchName', (req, res) => {
    const user = repo.getUserByTwitchName(req.params.twitchName);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const title = user.activeTitleId ? repo.getTitleById(user.activeTitleId) : null;
    const inventory = repo.getUserInventory(user.id);
    const stats = vendettaSystem.getVendettaStats(user.id);

    res.json({
      id: user.id,
      twitchName: user.twitchName,
      callsign: user.callsign,
      title: title ? { id: title.id, name: title.name } : null,
      credits: user.credits,
      lifetimeCredEarned: user.lifetimeCredEarned,
      lifetimeCredSpent: user.lifetimeCredSpent,
      raidsPlayed: user.raidsPlayed,
      extracts: user.extracts,
      deaths: user.deaths,
      extractRate: user.raidsPlayed > 0 ? (user.extracts / user.raidsPlayed) * 100 : 0,
      killsCredited: user.killsCredited,
      deathsAttributed: user.deathsAttributed,
      topNemesis: stats.topNemesis,
      topVictim: stats.topVictim,
      inventory: inventory.map(i => ({
        id: i.id,
        itemId: i.itemId,
        itemName: i.itemName,
        itemCategory: i.itemCategory,
        tier: i.tier,
        quantity: i.quantity,
        sellValueCred: i.sellValueCred,
      })),
    });
  });

  app.get('/api/public/vendetta/:a/:b', (req, res) => {
    const userA = repo.getUserByTwitchName(req.params.a);
    const userB = repo.getUserByTwitchName(req.params.b);
    if (!userA || !userB) {
      return res.status(404).json({ error: 'User not found' });
    }

    const h2h = vendettaSystem.getHeadToHead(userA.id, userB.id);
    if (!h2h) {
      return res.status(500).json({ error: 'Failed to get head-to-head' });
    }

    res.json(h2h);
  });

  app.get('/api/raid/current', (req, res) => {
    const raid = raidScheduler.getCurrentRaid();
    if (!raid) {
      return res.json({ state: 'IDLE', raid: null });
    }

    const participants = repo.getRaidParticipants(raid.id);
    const canJoin = raidScheduler.canJoinRaid();
    const canChangeLoadout = raidScheduler.canChangeLoadout();

    const now = Date.now();
    const startedAt = raid.startedAt;
    const duration = 7 * 60 * 1000; // 7 minutes
    const timeRemaining = Math.max(0, (startedAt + duration) - now);

    res.json({
      state: raidScheduler.getState(),
      raid: {
        id: raid.id,
        mapName: raid.mapName,
        startedAt: raid.startedAt,
        timeRemaining,
        canJoin,
        canChangeLoadout,
        participants: participants.map(p => ({
          userId: p.userId,
          twitchName: p.twitchName,
          callsign: p.callsign,
          loadout: p.loadout,
        })),
      },
    });
  });

  // Authenticated endpoints (require JWT)
  app.get('/api/me/profile', validateExtensionJWT, (req, res) => {
    const twitchName = req.user?.channel_id || req.user?.user_id;
    if (!twitchName) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const user = repo.getUserByTwitchName(twitchName);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const title = user.activeTitleId ? repo.getTitleById(user.activeTitleId) : null;
    const inventory = repo.getUserInventory(user.id);
    const stats = vendettaSystem.getVendettaStats(user.id);
    const killFeed = vendettaSystem.getRecentKillFeed(user.id, 5);

    res.json({
      id: user.id,
      twitchName: user.twitchName,
      callsign: user.callsign,
      title: title ? { id: title.id, name: title.name } : null,
      credits: user.credits,
      lifetimeCredEarned: user.lifetimeCredEarned,
      lifetimeCredSpent: user.lifetimeCredSpent,
      raidsPlayed: user.raidsPlayed,
      extracts: user.extracts,
      deaths: user.deaths,
      extractRate: user.raidsPlayed > 0 ? (user.extracts / user.raidsPlayed) * 100 : 0,
      killsCredited: user.killsCredited,
      deathsAttributed: user.deathsAttributed,
      topNemesis: stats.topNemesis,
      topVictim: stats.topVictim,
      killFeed,
      inventory: inventory.map(i => ({
        id: i.id,
        itemId: i.itemId,
        itemName: i.itemName,
        itemCategory: i.itemCategory,
        tier: i.tier,
        quantity: i.quantity,
        sellValueCred: i.sellValueCred,
      })),
    });
  });

  app.get('/api/me/inventory', validateExtensionJWT, (req, res) => {
    const twitchName = req.user?.channel_id || req.user?.user_id;
    if (!twitchName) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const user = repo.getUserByTwitchName(twitchName);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const inventory = repo.getUserInventory(user.id);
    res.json({
      inventory: inventory.map(i => ({
        id: i.id,
        itemId: i.itemId,
        itemName: i.itemName,
        itemCategory: i.itemCategory,
        tier: i.tier,
        quantity: i.quantity,
        sellValueCred: i.sellValueCred,
      })),
    });
  });

  app.post('/api/me/join', validateExtensionJWT, (req, res) => {
    const twitchName = req.user?.channel_id || req.user?.user_id;
    if (!twitchName) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const user = repo.getUserByTwitchName(twitchName);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!raidScheduler.canJoinRaid()) {
      return res.status(400).json({ error: 'No raid is currently open' });
    }

    const raid = raidScheduler.getCurrentRaid();
    if (!raid) {
      return res.status(500).json({ error: 'Raid not found' });
    }

    let loadout = 'LOOTING';
    const existingParticipant = repo.getRaidParticipants(raid.id).find(p => p.userId === user.id);
    if (existingParticipant) {
      loadout = existingParticipant.loadout;
    } else if (!user.hasUsedFreeLoadout) {
      loadout = 'FREE';
      repo.updateUserStats(user.id, { hasUsedFreeLoadout: true });
    }

    repo.addRaidParticipant(raid.id, user.id, loadout);
    res.json({ success: true, loadout });
  });

  app.post('/api/me/loadout', validateExtensionJWT, (req, res) => {
    const twitchName = req.user?.channel_id || req.user?.user_id;
    const { loadout } = req.body;

    if (!twitchName) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    if (!loadout || !['PVP', 'PVE', 'LOOTING'].includes(loadout.toUpperCase())) {
      return res.status(400).json({ error: 'Invalid loadout' });
    }

    const user = repo.getUserByTwitchName(twitchName);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const raid = raidScheduler.getCurrentRaid();
    if (!raid) {
      return res.json({ success: true, message: 'Loadout set for next raid' });
    }

    if (!raidScheduler.canChangeLoadout()) {
      return res.json({ success: true, message: 'Loadouts locked, set for next raid' });
    }

    repo.addRaidParticipant(raid.id, user.id, loadout.toUpperCase());
    res.json({ success: true, loadout: loadout.toUpperCase() });
  });

  app.post('/api/me/sell', validateExtensionJWT, (req, res) => {
    const twitchName = req.user?.channel_id || req.user?.user_id;
    if (!twitchName) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const user = repo.getUserByTwitchName(twitchName);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const result = economy.sellAllItems(user.id);
    res.json({ success: true, totalCred: result.totalCred, itemCount: result.itemCount });
  });

  app.post('/api/me/cashin', validateExtensionJWT, (req, res) => {
    const twitchName = req.user?.channel_id || req.user?.user_id;
    const { option } = req.body;

    if (!twitchName) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    if (!option) {
      return res.status(400).json({ error: 'Option required' });
    }

    const user = repo.getUserByTwitchName(twitchName);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const result = cashInSystem.processCashIn(user.id, option);
    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    res.json({
      success: true,
      redemptionId: result.redemptionId,
      message: result.message,
    });
  });

  app.get('/api/me/titles', validateExtensionJWT, (req, res) => {
    const twitchName = req.user?.channel_id || req.user?.user_id;
    if (!twitchName) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const user = repo.getUserByTwitchName(twitchName);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const allTitles = titlesSystem.getAllTitles();
    const ownedTitles = titlesSystem.getUserTitles(user.id);
    const ownedIds = new Set(ownedTitles.map(t => t.id));
    const nextTitle = titlesSystem.getNextTitle(user.id);

    res.json({
      allTitles: allTitles.map(t => ({
        id: t.id,
        name: t.name,
        tier: t.tier,
        rank: t.rank,
        cost: t.cost,
        owned: ownedIds.has(t.id),
        active: user.activeTitleId === t.id,
      })),
      nextTitle: nextTitle ? {
        id: nextTitle.id,
        name: nextTitle.name,
        cost: nextTitle.cost,
      } : null,
    });
  });

  app.post('/api/me/titles/buy', validateExtensionJWT, (req, res) => {
    const twitchName = req.user?.channel_id || req.user?.user_id;
    if (!twitchName) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const user = repo.getUserByTwitchName(twitchName);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const result = titlesSystem.purchaseNextTitle(user.id);
    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    res.json({ success: true, message: result.message });
  });

  app.post('/api/me/titles/set', validateExtensionJWT, (req, res) => {
    const twitchName = req.user?.channel_id || req.user?.user_id;
    const { titleName } = req.body;

    if (!twitchName) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    if (!titleName) {
      return res.status(400).json({ error: 'Title name required' });
    }

    const user = repo.getUserByTwitchName(twitchName);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const result = titlesSystem.setActiveTitle(user.id, titleName);
    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    res.json({ success: true, message: result.message });
  });

  // Admin endpoints (simplified - would need proper broadcaster auth)
  app.get('/api/admin/redemptions', validateExtensionJWT, (req, res) => {
    const redemptions = repo.getPendingRedemptions();
    res.json({
      redemptions: redemptions.map(r => ({
        id: r.id,
        userId: r.userId,
        twitchName: r.twitchName,
        callsign: r.callsign,
        type: r.type,
        cost: r.cost,
        createdAt: r.createdAt,
      })),
    });
  });

  app.post('/api/admin/approve', validateExtensionJWT, (req, res) => {
    const { redemptionId } = req.body;
    if (!redemptionId) {
      return res.status(400).json({ error: 'Redemption ID required' });
    }

    const redemption = repo.getRedemption(redemptionId);
    if (!redemption) {
      return res.status(404).json({ error: 'Redemption not found' });
    }

    if (redemption.status !== 'pending') {
      return res.status(400).json({ error: 'Redemption already processed' });
    }

    repo.approveRedemption(redemptionId, req.user?.channel_id || 'admin');
    res.json({ success: true });
  });

  app.post('/api/admin/deny', validateExtensionJWT, (req, res) => {
    const { redemptionId } = req.body;
    if (!redemptionId) {
      return res.status(400).json({ error: 'Redemption ID required' });
    }

    const redemption = repo.getRedemption(redemptionId);
    if (!redemption) {
      return res.status(404).json({ error: 'Redemption not found' });
    }

    if (redemption.status !== 'pending') {
      return res.status(400).json({ error: 'Redemption already processed' });
    }

    repo.denyRedemption(redemptionId);
    economy.refundCredits(redemption.userId, redemption.cost);
    res.json({ success: true });
  });

  app.post('/api/admin/complete', validateExtensionJWT, (req, res) => {
    const { redemptionId } = req.body;
    if (!redemptionId) {
      return res.status(400).json({ error: 'Redemption ID required' });
    }

    const redemption = repo.getRedemption(redemptionId);
    if (!redemption) {
      return res.status(404).json({ error: 'Redemption not found' });
    }

    if (redemption.status !== 'approved') {
      return res.status(400).json({ error: 'Redemption must be approved first' });
    }

    repo.completeRedemption(redemptionId);
    res.json({ success: true });
  });

  return app;
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}
