import { Repo } from '../db/repo';

export class VendettaSystem {
  constructor(private repo: Repo) {}

  getVendettaStats(userId: number) {
    const stats = this.repo.getKillStats(userId);
    const user = this.repo.getUserById(userId);

    const topNemesis = stats.deaths.length > 0 ? stats.deaths[0] : null;
    const topVictim = stats.kills.length > 0 ? stats.kills[0] : null;

    return {
      killsCredited: user?.killsCredited || 0,
      deathsAttributed: user?.deathsAttributed || 0,
      topNemesis: topNemesis ? {
        name: topNemesis.callsign || topNemesis.twitchName,
        kills: topNemesis.count,
      } : null,
      topVictim: topVictim ? {
        name: topVictim.callsign || topVictim.twitchName,
        kills: topVictim.count,
      } : null,
    };
  }

  getHeadToHead(userId1: number, userId2: number) {
    const user1 = this.repo.getUserById(userId1);
    const user2 = this.repo.getUserById(userId2);
    if (!user1 || !user2) {
      return null;
    }

    const h2h = this.repo.getHeadToHead(userId1, userId2);
    return {
      user1: {
        name: user1.callsign || user1.twitchName,
        kills: h2h.user1Kills,
      },
      user2: {
        name: user2.callsign || user2.twitchName,
        kills: h2h.user2Kills,
      },
    };
  }

  getRecentKillFeed(userId: number, limit: number = 5) {
    return this.repo.getRecentKillFeed(userId, limit).map(event => ({
      killer: event.killerCallsign || event.killerName,
      victim: event.victimCallsign || event.victimName,
      timestamp: event.createdAt,
    }));
  }
}
