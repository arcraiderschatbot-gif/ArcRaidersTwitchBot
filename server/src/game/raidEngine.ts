import { Repo } from '../db/repo';
import { Config } from '../config';

const weaponsData = require('../../data/seed/weapons.json');
const arcItemsData = require('../../data/seed/arc_items.json');
const arcVariantsData = require('../../data/seed/arc_variants.json');
const loreSnippetsData = require('../../data/seed/lore_snippets.json');

export interface RaidResult {
  participants: ParticipantResult[];
  encounters: EncounterEvent[];
  coopEvents: CoopEvent[];
  killAttributions: KillAttribution[];
  loreLine?: string;
  summary: {
    totalRaiders: number;
    extracts: number;
    deaths: number;
    bestHaul: { userId: number; value: number; name: string };
    mvp?: { userId: number; name: string };
  };
}

export interface ParticipantResult {
  userId: number;
  extracted: boolean;
  items: Array<{ id: string; name: string; category: string; tier: string; sellValueCred: number }>;
  totalValue: number;
}

export interface EncounterEvent {
  arcVariant: string;
  participants: number[];
  items: Array<{ id: string; name: string; category: string; tier: string; sellValueCred: number }>;
}

export interface CoopEvent {
  type: string;
  raiderA: { userId: number; name: string };
  raiderB: { userId: number; name: string };
}

export interface KillAttribution {
  killerUserId: number;
  victimUserId: number;
  killerName: string;
  victimName: string;
}

export class RaidEngine {
  private rng: () => number;

  constructor(
    private repo: Repo,
    private config: Config,
    seed?: number
  ) {
    // Simple seeded RNG for testing
    let state = seed || Date.now();
    this.rng = () => {
      state = (state * 9301 + 49297) % 233280;
      return state / 233280;
    };
  }

  resolveRaid(raidId: number, mapName: string): RaidResult {
    const participants = this.repo.getRaidParticipants(raidId);
    const mapConfig = this.repo.getMapCache(mapName) || { difficultyScalar: 1.0, encounterBias: 0 };

    // Roll encounters
    const encounterMax = Math.max(0, Math.min(3, this.config.game.encounterMax + mapConfig.encounterBias));
    const encounters = this.generateEncounters(participants, encounterMax);

    // Roll coop events
    const coopEvents = this.generateCoopEvents(participants);

    // Resolve each participant
    const participantResults: ParticipantResult[] = [];
    const extractedPvP: Array<{ userId: number; loadout: string }> = [];

    for (const p of participants) {
      const extractChance = this.calculateExtractChance(p.loadout, mapConfig.difficultyScalar, p.userId, coopEvents);
      const extracted = this.rng() < extractChance;

      if (extracted && p.loadout === 'PVP') {
        extractedPvP.push({ userId: p.userId, loadout: p.loadout });
      }

      const items = extracted ? this.generateLoot(p.loadout, encounters, p.userId) : [];
      const totalValue = items.reduce((sum, item) => sum + item.sellValueCred, 0);

      participantResults.push({
        userId: p.userId,
        extracted,
        items,
        totalValue,
      });
    }

    // Apply kill attributions
    const killAttributions = this.attributeKills(participants, participantResults, extractedPvP);

    // Generate lore line (50% chance)
    const loreLine = this.rng() < 0.5 ? this.getRandomLoreSnippet() : undefined;

    // Calculate summary
    const extracts = participantResults.filter(r => r.extracted).length;
    const deaths = participantResults.filter(r => !r.extracted).length;
    const bestHaul = participantResults
      .filter(r => r.extracted)
      .sort((a, b) => b.totalValue - a.totalValue)[0] || { userId: 0, value: 0, name: 'None' };

    const mvp = extracts > 0 && this.rng() < 0.3
      ? participantResults
          .filter(r => r.extracted)
          .sort((a, b) => b.totalValue - a.totalValue)[0]
      : undefined;

    return {
      participants: participantResults,
      encounters,
      coopEvents,
      killAttributions,
      loreLine,
      summary: {
        totalRaiders: participants.length,
        extracts,
        deaths,
        bestHaul: {
          userId: bestHaul.userId,
          value: bestHaul.totalValue,
          name: participants.find(p => p.userId === bestHaul.userId)?.callsign || participants.find(p => p.userId === bestHaul.userId)?.twitchName || 'Unknown',
        },
        mvp: mvp ? {
          userId: mvp.userId,
          name: participants.find(p => p.userId === mvp.userId)?.callsign || participants.find(p => p.userId === mvp.userId)?.twitchName || 'Unknown',
        } : undefined,
      },
    };
  }

  private calculateExtractChance(
    loadout: string,
    difficultyScalar: number,
    userId: number,
    coopEvents: CoopEvent[]
  ): number {
    let chance = this.config.game.baseExtractChance;

    // Loadout modifiers
    if (loadout === 'PVP') {
      chance += this.config.game.pvpExtractChanceDelta;
    } else if (loadout === 'PVE') {
      chance += this.config.game.pveExtractChanceDelta;
    } else if (loadout === 'LOOTING') {
      chance += this.config.game.lootingExtractChanceDelta;
    } else if (loadout === 'FREE') {
      chance += this.config.game.freeExtractChanceDelta;
    }

    // Map modifier (capped at ±1%)
    const mapMod = (difficultyScalar - 1.0) * 0.10;
    chance += Math.max(-this.config.game.mapExtractModifierCap, Math.min(this.config.game.mapExtractModifierCap, mapMod));

    // Coop bonus (tiny)
    const coopBonus = coopEvents
      .filter(e => e.raiderA.userId === userId || e.raiderB.userId === userId)
      .length * this.config.game.coopBonusExtractChance;
    chance += Math.min(coopBonus, this.config.game.coopBonusMax);

    return Math.max(0.05, Math.min(0.95, chance));
  }

  private generateLoot(
    loadout: string,
    encounters: EncounterEvent[],
    userId: number
  ): Array<{ id: string; name: string; category: string; tier: string; sellValueCred: number }> {
    const allItems = [...weaponsData, ...arcItemsData];
    const items: Array<{ id: string; name: string; category: string; tier: string; sellValueCred: number }> = [];

    // Base item count
    let itemCount = 3;
    if (loadout === 'PVP') {
      itemCount = 2; // Fewer items, higher tier
    } else if (loadout === 'LOOTING') {
      itemCount = Math.floor(itemCount * this.config.game.lootingItemCountMultiplier);
    }

    // Encounter items
    for (const enc of encounters) {
      if (enc.participants.includes(userId)) {
        items.push(...enc.items);
      }
    }

      // Regular loot
      const tierWeights = { common: 0.6, rare: 0.3, high: 0.1 };
      if (loadout === 'PVP') {
        tierWeights.common = 0.3;
        tierWeights.rare = 0.4;
        tierWeights.high = 0.3;
      }

      while (items.length < itemCount) {
        const tier = this.rollTier(tierWeights);
        const tierItems = allItems.filter((i: any) => i.tier === tier);
        if (tierItems.length > 0) {
          const item = tierItems[Math.floor(this.rng() * tierItems.length)];
          items.push(item);
        }
      }

    // Apply value multiplier
    const multiplier = loadout === 'PVP' ? this.config.game.pvpValueMultiplier
      : loadout === 'LOOTING' ? this.config.game.lootingValueMultiplier
      : loadout === 'FREE' ? this.config.game.freeValueMultiplier
      : this.config.game.pveValueMultiplier;

    const adjustedItems = items.map(item => ({
      ...item,
      sellValueCred: Math.floor(item.sellValueCred * multiplier),
    }));

    // Apply hard caps
    const sorted = adjustedItems.sort((a, b) => b.sellValueCred - a.sellValueCred);
    const capped: typeof adjustedItems = [];
    let totalValue = 0;
    let itemCountCapped = 0;

    for (const item of sorted) {
      if (itemCountCapped >= this.config.game.maxItemsPerRaid) break;
      if (totalValue + item.sellValueCred > this.config.game.maxValuePerRaid) break;
      capped.push(item);
      totalValue += item.sellValueCred;
      itemCountCapped++;
    }

    return capped;
  }

  private rollTier(weights: { common: number; rare: number; high: number }): string {
    const r = this.rng();
    if (r < weights.common) return 'common';
    if (r < weights.common + weights.rare) return 'rare';
    return 'high';
  }

  private generateEncounters(
    participants: any[],
    maxEncounters: number
  ): EncounterEvent[] {
    const encounters: EncounterEvent[] = [];
    const encounterCount = Math.floor(this.rng() * (maxEncounters + 1));

    for (let i = 0; i < encounterCount; i++) {
      const arcVariant = arcVariantsData[Math.floor(this.rng() * arcVariantsData.length)];
      const participantCount = Math.min(participants.length, Math.floor(this.rng() * 3) + 1);
      const selectedParticipants = this.shuffle([...participants])
        .slice(0, participantCount)
        .map(p => p.userId);

      // Generate encounter items
      const itemCount = Math.floor(this.rng() * 2) + 1;
      const items: Array<{ id: string; name: string; category: string; tier: string; sellValueCred: number }> = [];
      const arcItems = arcItemsData;

      for (let j = 0; j < itemCount; j++) {
        const tier = this.rollTier({ common: 0.5, rare: 0.4, high: 0.1 });
        const tierItems = arcItems.filter((item: any) => item.tier === tier);
        if (tierItems.length > 0) {
          items.push(tierItems[Math.floor(this.rng() * tierItems.length)]);
        }
      }

      encounters.push({
        arcVariant,
        participants: selectedParticipants,
        items,
      });
    }

    return encounters;
  }

  private generateCoopEvents(participants: any[]): CoopEvent[] {
    const events: CoopEvent[] = [];
    const eventCount = Math.min(3, Math.floor(this.rng() * 4));

    // Weight toward PVE and LOOTING
    const coopEligible = participants.filter(p => p.loadout !== 'PVP');
    if (coopEligible.length < 2) return events;

    const coopTypes = [
      { type: 'covered', message: '🤝 {A} covered {B} during extraction.' },
      { type: 'shared', message: '🛠️ {A} shared ammo with {B}.' },
      { type: 'helped', message: '⚡ {A} helped {B} take down an ARC threat.' },
    ];

    for (let i = 0; i < eventCount; i++) {
      const shuffled = this.shuffle([...coopEligible]);
      if (shuffled.length >= 2) {
        const raiderA = shuffled[0];
        const raiderB = shuffled[1];
        const coopType = coopTypes[Math.floor(this.rng() * coopTypes.length)];

        events.push({
          type: coopType.type,
          raiderA: { userId: raiderA.userId, name: raiderA.callsign || raiderA.twitchName },
          raiderB: { userId: raiderB.userId, name: raiderB.callsign || raiderB.twitchName },
        });
      }
    }

    return events;
  }

  private attributeKills(
    participants: any[],
    results: ParticipantResult[],
    extractedPvP: Array<{ userId: number; loadout: string }>
  ): KillAttribution[] {
    const attributions: KillAttribution[] = [];
    const deaths = results.filter(r => !r.extracted);
    let killMessageCount = 0;

    for (const death of deaths) {
      if (killMessageCount >= this.config.game.maxKillMessagesPerRaid) break;
      if (extractedPvP.length === 0) continue;

      if (this.rng() < this.config.game.killAttributionProbability) {
        const killer = extractedPvP[Math.floor(this.rng() * extractedPvP.length)];
        const victim = participants.find(p => p.userId === death.userId);

        if (killer && victim) {
          attributions.push({
            killerUserId: killer.userId,
            victimUserId: death.userId,
            killerName: participants.find(p => p.userId === killer.userId)?.callsign || participants.find(p => p.userId === killer.userId)?.twitchName || 'Unknown',
            victimName: victim.callsign || victim.twitchName,
          });
          killMessageCount++;
        }
      }
    }

    return attributions;
  }

  private getRandomLoreSnippet(): string {
    const snippets = loreSnippetsData;
    return snippets[Math.floor(this.rng() * snippets.length)];
  }

  private shuffle<T>(array: T[]): T[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
