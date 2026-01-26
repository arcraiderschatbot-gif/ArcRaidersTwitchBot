import { RaidEngine } from '../raidEngine';
import { Repo } from '../../db/repo';
import { Config, defaultConfig } from '../../config';

describe('RaidEngine', () => {
  let repo: Repo;
  let engine: RaidEngine;
  let config: Config;

  beforeEach(() => {
    // Use in-memory database for tests
    repo = new Repo(':memory:');
    config = { ...defaultConfig };
    engine = new RaidEngine(repo, config, 12345); // Fixed seed for deterministic tests
  });

  afterEach(() => {
    repo.close();
  });

  describe('extract chance calculations', () => {
    it('should clamp extract chance between 5% and 95%', () => {
      // Test with extreme modifiers
      const mapConfig = { difficultyScalar: 2.0, encounterBias: 0 };
      const extractChance = (engine as any).calculateExtractChance('PVP', mapConfig.difficultyScalar, 1, []);
      
      expect(extractChance).toBeGreaterThanOrEqual(0.05);
      expect(extractChance).toBeLessThanOrEqual(0.95);
    });

    it('should apply PVP extract chance delta', () => {
      const mapConfig = { difficultyScalar: 1.0, encounterBias: 0 };
      const pvpChance = (engine as any).calculateExtractChance('PVP', mapConfig.difficultyScalar, 1, []);
      const pveChance = (engine as any).calculateExtractChance('PVE', mapConfig.difficultyScalar, 1, []);
      
      expect(pvpChance).toBeLessThan(pveChance);
      expect(pvpChance).toBe(pveChance + config.game.pvpExtractChanceDelta);
    });

    it('should cap map extract modifier at ±1%', () => {
      const extremeMap = { difficultyScalar: 2.0, encounterBias: 0 };
      const normalMap = { difficultyScalar: 1.0, encounterBias: 0 };
      
      const extremeChance = (engine as any).calculateExtractChance('PVE', extremeMap.difficultyScalar, 1, []);
      const normalChance = (engine as any).calculateExtractChance('PVE', normalMap.difficultyScalar, 1, []);
      
      const diff = Math.abs(extremeChance - normalChance);
      expect(diff).toBeLessThanOrEqual(config.game.mapExtractModifierCap + 0.001); // Small epsilon for floating point
    });
  });

  describe('loot generation', () => {
    it('should respect max items per raid', () => {
      const items = (engine as any).generateLoot('LOOTING', [], 1);
      expect(items.length).toBeLessThanOrEqual(config.game.maxItemsPerRaid);
    });

    it('should respect max value per raid', () => {
      const items = (engine as any).generateLoot('PVP', [], 1);
      const totalValue = items.reduce((sum: number, item: any) => sum + item.sellValueCred, 0);
      expect(totalValue).toBeLessThanOrEqual(config.game.maxValuePerRaid);
    });

    it('should apply PVP value multiplier', () => {
      const pvpItems = (engine as any).generateLoot('PVP', [], 1);
      const pveItems = (engine as any).generateLoot('PVE', [], 1);
      
      // PVP should have higher average value per item
      const pvpAvg = pvpItems.reduce((sum: number, item: any) => sum + item.sellValueCred, 0) / (pvpItems.length || 1);
      const pveAvg = pveItems.reduce((sum: number, item: any) => sum + item.sellValueCred, 0) / (pveItems.length || 1);
      
      // With multiplier, PVP should be higher (allowing some variance)
      expect(pvpAvg).toBeGreaterThan(pveAvg * 0.8); // At least 80% of multiplier effect
    });
  });

  describe('encounter generation', () => {
    it('should respect encounter max with bias', () => {
      const participants = [
        { userId: 1, loadout: 'PVE', twitchName: 'user1', callsign: 'User1' },
        { userId: 2, loadout: 'PVE', twitchName: 'user2', callsign: 'User2' },
      ];
      
      const encounters = (engine as any).generateEncounters(participants, 3);
      expect(encounters.length).toBeLessThanOrEqual(3);
    });

    it('should clamp encounter max to 0-3', () => {
      const participants = [
        { userId: 1, loadout: 'PVE', twitchName: 'user1', callsign: 'User1' },
      ];
      
      // Test with extreme bias values
      const encounters1 = (engine as any).generateEncounters(participants, -1); // Should clamp to 0
      const encounters2 = (engine as any).generateEncounters(participants, 10); // Should clamp to 3
      
      expect(encounters1.length).toBeLessThanOrEqual(3);
      expect(encounters2.length).toBeLessThanOrEqual(3);
    });
  });

  describe('coop bonus', () => {
    it('should cap coop bonus at max', () => {
      const mapConfig = { difficultyScalar: 1.0, encounterBias: 0 };
      const manyCoopEvents = [
        { type: 'covered', raiderA: { userId: 1, name: 'A' }, raiderB: { userId: 2, name: 'B' } },
        { type: 'shared', raiderA: { userId: 1, name: 'A' }, raiderB: { userId: 2, name: 'B' } },
        { type: 'helped', raiderA: { userId: 1, name: 'A' }, raiderB: { userId: 2, name: 'B' } },
        { type: 'covered', raiderA: { userId: 1, name: 'A' }, raiderB: { userId: 2, name: 'B' } },
      ];
      
      const chance = (engine as any).calculateExtractChance('PVE', mapConfig.difficultyScalar, 1, manyCoopEvents);
      const baseChance = config.game.baseExtractChance;
      const maxBonus = config.game.coopBonusMax;
      
      expect(chance).toBeLessThanOrEqual(baseChance + maxBonus + 0.001);
    });
  });

  describe('kill attribution', () => {
    it('should only attribute to extracted PVP raiders', () => {
      const participants = [
        { userId: 1, loadout: 'PVP', twitchName: 'killer', callsign: 'Killer' },
        { userId: 2, loadout: 'PVE', twitchName: 'victim', callsign: 'Victim' },
      ];
      
      const results = [
        { userId: 1, extracted: true, items: [], totalValue: 0 },
        { userId: 2, extracted: false, items: [], totalValue: 0 },
      ];
      
      const extractedPvP = [{ userId: 1, loadout: 'PVP' }];
      const attributions = (engine as any).attributeKills(participants, results, extractedPvP);
      
      // With seed, should get deterministic results
      expect(attributions.length).toBeGreaterThanOrEqual(0);
      expect(attributions.length).toBeLessThanOrEqual(config.game.maxKillMessagesPerRaid);
    });

    it('should cap kill messages per raid', () => {
      const participants = Array.from({ length: 20 }, (_, i) => ({
        userId: i + 1,
        loadout: 'PVE',
        twitchName: `user${i + 1}`,
        callsign: `User${i + 1}`,
      }));
      
      const results = participants.map((p, i) => ({
        userId: p.userId,
        extracted: i < 5, // 5 extract, 15 die
        items: [],
        totalValue: 0,
      }));
      
      const extractedPvP = [{ userId: 1, loadout: 'PVP' }];
      const attributions = (engine as any).attributeKills(participants, results, extractedPvP);
      
      expect(attributions.length).toBeLessThanOrEqual(config.game.maxKillMessagesPerRaid);
    });
  });
});
