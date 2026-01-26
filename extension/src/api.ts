import { twitchHelper } from './twitchHelper';

const API_BASE = process.env.VITE_API_BASE || 'http://localhost:3000';

export interface Profile {
  id: number;
  twitchName: string;
  callsign: string;
  title: { id: number; name: string } | null;
  credits: number;
  lifetimeCredEarned: number;
  lifetimeCredSpent: number;
  raidsPlayed: number;
  extracts: number;
  deaths: number;
  extractRate: number;
  killsCredited: number;
  deathsAttributed: number;
  topNemesis: { name: string; kills: number } | null;
  topVictim: { name: string; kills: number } | null;
  killFeed?: Array<{ killer: string; victim: string; timestamp: number }>;
  inventory: Array<{
    id: number;
    itemId: string;
    itemName: string;
    itemCategory: string;
    tier: string;
    quantity: number;
    sellValueCred: number;
  }>;
}

export interface Raid {
  state: string;
  raid: {
    id: number;
    mapName: string;
    startedAt: number;
    timeRemaining: number;
    canJoin: boolean;
    canChangeLoadout: boolean;
    participants: Array<{
      userId: number;
      twitchName: string;
      callsign: string;
      loadout: string;
    }>;
  } | null;
}

async function apiCall<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = twitchHelper.getToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export const api = {
  // Public
  getPublicProfile: (twitchName: string): Promise<Profile> =>
    apiCall(`/api/public/profile/${twitchName}`),

  getVendetta: (a: string, b: string): Promise<{ user1: { name: string; kills: number }; user2: { name: string; kills: number } }> =>
    apiCall(`/api/public/vendetta/${a}/${b}`),

  getCurrentRaid: (): Promise<Raid> =>
    apiCall('/api/raid/current'),

  // Authenticated
  getMyProfile: (): Promise<Profile> =>
    apiCall('/api/me/profile'),

  getMyInventory: (): Promise<{ inventory: Profile['inventory'] }> =>
    apiCall('/api/me/inventory'),

  joinRaid: (): Promise<{ success: boolean; loadout: string }> =>
    apiCall('/api/me/join', { method: 'POST' }),

  setLoadout: (loadout: string): Promise<{ success: boolean; loadout?: string; message?: string }> =>
    apiCall('/api/me/loadout', {
      method: 'POST',
      body: JSON.stringify({ loadout }),
    }),

  sellAll: (): Promise<{ success: boolean; totalCred: number; itemCount: number }> =>
    apiCall('/api/me/sell', { method: 'POST' }),

  cashIn: (option: string): Promise<{ success: boolean; redemptionId?: number; message?: string }> =>
    apiCall('/api/me/cashin', {
      method: 'POST',
      body: JSON.stringify({ option }),
    }),

  getTitles: (): Promise<{
    allTitles: Array<{ id: number; name: string; tier: string; rank: number; cost: number; owned: boolean; active: boolean }>;
    nextTitle: { id: number; name: string; cost: number } | null;
  }> =>
    apiCall('/api/me/titles'),

  buyTitle: (): Promise<{ success: boolean; message: string }> =>
    apiCall('/api/me/titles/buy', { method: 'POST' }),

  setTitle: (titleName: string): Promise<{ success: boolean; message: string }> =>
    apiCall('/api/me/titles/set', {
      method: 'POST',
      body: JSON.stringify({ titleName }),
    }),
};
