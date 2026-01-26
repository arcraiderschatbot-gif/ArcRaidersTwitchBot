import { Repo } from '../db/repo';
import { Config } from '../config';
import { RaidEngine } from './raidEngine';
import { SendQueue } from '../bot/sendQueue';

const mapsData = require('../../data/seed/maps.json');

export type RaidState = 'IDLE' | 'OPEN' | 'RESOLVE';

export class RaidScheduler {
  private state: RaidState = 'IDLE';
  private currentRaidId: number | null = null;
  private raidStartTime: number = 0;
  private raidEndTime: number = 0;
  private loadoutLockTime: number = 0;
  private warningSent: Set<number> = new Set();
  private intervalHandle: NodeJS.Timeout | null = null;
  private raidTimeout: NodeJS.Timeout | null = null;
  private warningTimeouts: NodeJS.Timeout[] = [];

  constructor(
    private repo: Repo,
    private config: Config,
    private raidEngine: RaidEngine,
    private sendQueue: SendQueue
  ) {
    this.initializeMaps();
  }

  start() {
    // Start first raid immediately
    this.startRaidCycle();
    
    // Then schedule every 15 minutes
    this.intervalHandle = setInterval(() => {
      this.startRaidCycle();
    }, this.config.game.raidIntervalMinutes * 60 * 1000);
  }

  stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    if (this.raidTimeout) {
      clearTimeout(this.raidTimeout);
      this.raidTimeout = null;
    }
    this.warningTimeouts.forEach(t => clearTimeout(t));
    this.warningTimeouts = [];
  }

  getState(): RaidState {
    return this.state;
  }

  getCurrentRaid() {
    if (this.currentRaidId) {
      return this.repo.getCurrentRaid();
    }
    return null;
  }

  canJoinRaid(): boolean {
    return this.state === 'OPEN' && Date.now() < this.raidEndTime;
  }

  canChangeLoadout(): boolean {
    return Date.now() < this.loadoutLockTime;
  }

  private startRaidCycle() {
    if (this.state !== 'IDLE') {
      return; // Skip if already in a raid
    }

    this.state = 'OPEN';
    const map = this.selectRandomMap();
    this.currentRaidId = this.repo.createRaid(map.name);
    this.raidStartTime = Date.now();
    this.raidEndTime = this.raidStartTime + (this.config.game.raidDurationMinutes * 60 * 1000);
    this.loadoutLockTime = this.raidEndTime - (this.config.game.loadoutLockSeconds * 1000);
    this.warningSent.clear();

    // Get raid number (count previous raids)
    const raidNumber = this.repo.getRaidCount();

    // Announce raid
    this.sendQueue.enqueue(
      `🔴 RAID #${raidNumber} STARTING on ${map.name}! Type !join to participate. Choose loadout: !loadout pvp | pve | looting`,
      10
    );

    // Schedule warnings
    for (const warningMin of this.config.game.warningMinutes) {
      const warningTime = this.raidEndTime - (warningMin * 60 * 1000);
      if (warningTime > Date.now()) {
        const timeout = setTimeout(() => {
          if (this.state === 'OPEN' && !this.warningSent.has(warningMin)) {
            this.sendQueue.enqueue(
              `⏰ ${warningMin} minute${warningMin > 1 ? 's' : ''} remaining to join RAID #${raidNumber}! Loadouts lock in ${Math.floor((this.loadoutLockTime - Date.now()) / 1000)}s`,
              5
            );
            this.warningSent.add(warningMin);
          }
        }, warningTime - Date.now());
        this.warningTimeouts.push(timeout);
      }
    }

    // Schedule loadout lock warning
    const lockWarningTime = this.loadoutLockTime - 10000; // 10s before lock
    if (lockWarningTime > Date.now()) {
      const timeout = setTimeout(() => {
        if (this.state === 'OPEN') {
          this.sendQueue.enqueue(`🔒 Loadouts lock in 10 seconds!`, 5);
        }
      }, lockWarningTime - Date.now());
      this.warningTimeouts.push(timeout);
    }

    // Schedule raid end
    this.raidTimeout = setTimeout(() => {
      this.resolveRaid();
    }, this.config.game.raidDurationMinutes * 60 * 1000);
  }

  private resolveRaid() {
    if (this.state !== 'OPEN' || !this.currentRaidId) {
      return;
    }

    this.state = 'RESOLVE';
    this.repo.updateRaidState(this.currentRaidId, 'RESOLVE');

    const raid = this.repo.getCurrentRaid();
    if (!raid) return;

    const result = this.raidEngine.resolveRaid(this.currentRaidId, raid.mapName);
    const participants = this.repo.getRaidParticipants(this.currentRaidId);

    // Save results
    for (const pResult of result.participants) {
      const user = this.repo.getUserById(pResult.userId);
      if (!user) continue;

      const itemsJson = JSON.stringify(pResult.items);
      this.repo.updateRaidParticipant(
        this.currentRaidId,
        pResult.userId,
        pResult.extracted,
        pResult.totalValue,
        itemsJson
      );

      // Update user stats
      const newRaidsPlayed = user.raidsPlayed + 1;
      const newExtracts = pResult.extracted ? user.extracts + 1 : user.extracts;
      const newDeaths = !pResult.extracted ? user.deaths + 1 : user.deaths;

      this.repo.updateUserStats(pResult.userId, {
        raidsPlayed: newRaidsPlayed,
        extracts: newExtracts,
        deaths: newDeaths,
      });

      // Add items to inventory if extracted
      if (pResult.extracted) {
        for (const item of pResult.items) {
          this.repo.addItem(pResult.userId, item, 1);
        }

        // First extract guarantee
        if (!user.hasFirstExtractRewarded && pResult.items.length === 0) {
          // Add a guaranteed item
          const allItems = require('../../data/seed/weapons.json');
          const commonItem = allItems.find((i: any) => i.tier === 'common');
          if (commonItem) {
            this.repo.addItem(pResult.userId, commonItem, 1);
          }
          this.repo.updateUserStats(pResult.userId, { hasFirstExtractRewarded: true });
        }
      }
    }

    // Record kill attributions
    for (const kill of result.killAttributions) {
      this.repo.recordKill(kill.killerUserId, kill.victimUserId, this.currentRaidId);
      
      // Update user stats
      const killer = this.repo.getUserById(kill.killerUserId);
      const victim = this.repo.getUserById(kill.victimUserId);
      if (killer) {
        this.repo.updateUserStats(kill.killerUserId, { killsCredited: killer.killsCredited + 1 });
      }
      if (victim) {
        this.repo.updateUserStats(kill.victimUserId, { deathsAttributed: victim.deathsAttributed + 1 });
      }
    }

    // Announce results
    this.announceResults(result, participants);

    // Reset to IDLE
    this.repo.updateRaidState(this.currentRaidId, 'IDLE', Date.now());
    this.currentRaidId = null;
    this.state = 'IDLE';
    this.warningTimeouts.forEach(t => clearTimeout(t));
    this.warningTimeouts = [];
  }

  private announceResults(result: any, participants: any[]) {
    const lines: string[] = [];

    // Lore line
    if (result.loreLine) {
      lines.push(result.loreLine);
    }

    // Encounters
    for (const enc of result.encounters) {
      if (enc.items.length > 0) {
        const names = enc.participants.map((uid: number) => {
          const p = participants.find(p => p.userId === uid);
          return p?.callsign || p?.twitchName || 'Unknown';
        }).join(', ');
        lines.push(`⚔️ ${enc.arcVariant} encountered! ${names} recovered ARC tech.`);
      }
    }

    // Coop events
    for (const coop of result.coopEvents) {
      const msg = coop.type === 'covered' 
        ? `🤝 ${coop.raiderA.name} covered ${coop.raiderB.name} during extraction.`
        : coop.type === 'shared'
        ? `🛠️ ${coop.raiderA.name} shared ammo with ${coop.raiderB.name}.`
        : `⚡ ${coop.raiderA.name} helped ${coop.raiderB.name} take down an ARC threat.`;
      lines.push(msg);
    }

    // Kill attributions
    for (const kill of result.killAttributions) {
      lines.push(`☠️ ${kill.victimName} was eliminated by ${kill.killerName}.`);
    }

    // Summary
    const summary = result.summary;
    let summaryLine = `📊 RAID COMPLETE: ${summary.totalRaiders} raiders | ${summary.extracts} extracted | ${summary.deaths} lost`;
    if (summary.bestHaul.value > 0) {
      summaryLine += ` | Best haul: ${summary.bestHaul.name} (${summary.bestHaul.value} Cred)`;
    }
    if (summary.mvp) {
      summaryLine += ` | MVP: ${summary.mvp.name}`;
    }
    lines.push(summaryLine);

    // Send all lines (condensed)
    for (const line of lines.slice(0, 8)) { // Cap at 8 lines
      this.sendQueue.enqueue(line, 3);
    }
  }

  private selectRandomMap(): { name: string; difficultyScalar: number; encounterBias: number } {
    const maps = mapsData;
    const map = maps[Math.floor(Math.random() * maps.length)];
    
    // Cache map if not already cached
    if (!this.repo.getMapCache(map.name)) {
      this.repo.updateMapCache(map.name, map.difficultyScalar, map.encounterBias);
    }
    
    return map;
  }

  private initializeMaps() {
    const maps = mapsData;
    for (const map of maps) {
      if (!this.repo.getMapCache(map.name)) {
        this.repo.updateMapCache(map.name, map.difficultyScalar, map.encounterBias);
      }
    }
  }
}
