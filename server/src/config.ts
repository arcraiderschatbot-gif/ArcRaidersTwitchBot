export interface Config {
  twitch: {
    username: string;
    oauthToken: string;
    channel: string;
  };
  database: {
    path: string;
  };
  extension: {
    secret: string;
    clientId?: string;
    baseUrl: string;
  };
  rateLimits: {
    globalMessagesPer30s: number;
    perChannelMessagesPerSecond: number;
  };
  game: {
    raidIntervalMinutes: number;
    raidDurationMinutes: number;
    loadoutLockSeconds: number;
    warningMinutes: number[];
    baseExtractChance: number;
    maxItemsPerRaid: number;
    maxValuePerRaid: number;
    pvpExtractChanceDelta: number;
    pvpValueMultiplier: number;
    pveExtractChanceDelta: number;
    pveValueMultiplier: number;
    lootingExtractChanceDelta: number;
    lootingItemCountMultiplier: number;
    lootingValueMultiplier: number;
    freeExtractChanceDelta: number;
    freeValueMultiplier: number;
    killAttributionProbability: number;
    maxKillMessagesPerRaid: number;
    coopBonusExtractChance: number;
    coopBonusMax: number;
    mapExtractModifierCap: number;
    encounterMax: number;
    streamerApprovalRequired: boolean;
  };
  cashin: {
    pingCooldownSeconds: number;
    pingCost: number;
    options: Record<string, CashInOption>;
  };
}

export interface CashInOption {
  cost: number;
  requiresApproval: boolean;
  description: string;
}

export const defaultConfig: Config = {
  twitch: {
    username: process.env.TWITCH_USERNAME || '',
    oauthToken: process.env.TWITCH_OAUTH_TOKEN || '',
    channel: process.env.TWITCH_CHANNEL || '',
  },
  database: {
    path: process.env.DB_PATH || './data/arcraids.db',
  },
  extension: {
    secret: process.env.EXTENSION_SECRET || '',
    clientId: process.env.EXTENSION_CLIENT_ID || '',
    baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  },
  rateLimits: {
    globalMessagesPer30s: 20,
    perChannelMessagesPerSecond: 1,
  },
  game: {
    raidIntervalMinutes: 15,
    raidDurationMinutes: 7,
    loadoutLockSeconds: 60,
    warningMinutes: [3, 1],
    baseExtractChance: 0.60,
    maxItemsPerRaid: 8,
    maxValuePerRaid: 5000,
    pvpExtractChanceDelta: -0.20,
    pvpValueMultiplier: 1.40,
    pveExtractChanceDelta: 0.0,
    pveValueMultiplier: 1.0,
    lootingExtractChanceDelta: 0.05,
    lootingItemCountMultiplier: 1.15,
    lootingValueMultiplier: 0.90,
    freeExtractChanceDelta: -0.25,
    freeValueMultiplier: 0.80,
    killAttributionProbability: 0.35,
    maxKillMessagesPerRaid: 5,
    coopBonusExtractChance: 0.01,
    coopBonusMax: 0.02,
    mapExtractModifierCap: 0.01,
    encounterMax: 3,
    streamerApprovalRequired: true,
  },
  cashin: {
    pingCooldownSeconds: 60,
    pingCost: 250,
    options: {
      ping: { cost: 250, requiresApproval: false, description: 'Ping effect' },
      ping2: { cost: 250, requiresApproval: false, description: 'Ping effect 2' },
      ping3: { cost: 250, requiresApproval: false, description: 'Ping effect 3' },
      shoutout: { cost: 1000, requiresApproval: false, description: 'Shoutout' },
      scout: { cost: 1500, requiresApproval: false, description: 'Scout' },
      insure: { cost: 5000, requiresApproval: false, description: 'Insurance' },
      event: { cost: 7500, requiresApproval: false, description: 'Event modifier' },
      reroll: { cost: 15000, requiresApproval: false, description: 'Reroll last raid' },
      mvp: { cost: 20000, requiresApproval: false, description: 'MVP tie-break' },
      shoot: { cost: 500, requiresApproval: true, description: 'Streamer shoots weapon' },
      drop_shields: { cost: 750, requiresApproval: true, description: 'Streamer drops shields' },
      prox_chat: { cost: 1000, requiresApproval: true, description: 'Keep proximity chat on' },
      instigate: { cost: 2000, requiresApproval: true, description: 'Instigate fight' },
      stella_montis_full: { cost: 5000, requiresApproval: true, description: 'Full loadout Stella Montis' },
    },
  },
};

export function loadConfig(): Config {
  // Read from process.env directly to ensure dotenv-loaded values are used
  return {
    ...defaultConfig,
    twitch: {
      username: process.env.TWITCH_USERNAME || defaultConfig.twitch.username,
      oauthToken: process.env.TWITCH_OAUTH_TOKEN || defaultConfig.twitch.oauthToken,
      channel: process.env.TWITCH_CHANNEL || defaultConfig.twitch.channel,
    },
    database: {
      path: process.env.DB_PATH || defaultConfig.database.path,
    },
    extension: {
      secret: process.env.EXTENSION_SECRET || defaultConfig.extension.secret,
      clientId: process.env.EXTENSION_CLIENT_ID || defaultConfig.extension.clientId,
      baseUrl: process.env.BASE_URL || defaultConfig.extension.baseUrl,
    },
  };
}
