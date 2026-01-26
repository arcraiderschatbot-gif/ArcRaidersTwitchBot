import { Repo } from '../../db/repo';
import { Config } from '../../config';
import { RaidScheduler } from '../../game/raidScheduler';
import { Economy } from '../../game/economy';
import { CashInSystem } from '../../game/cashin';
import { TitlesSystem } from '../../game/titles';
import { VendettaSystem } from '../../game/vendetta';
import { SendQueue } from '../sendQueue';

export interface CommandContext {
  username: string;
  userId?: number;
  message: string;
  args: string[];
}

export class CommandHandler {
  constructor(
    private repo: Repo,
    private config: Config,
    private raidScheduler: RaidScheduler,
    private economy: Economy,
    private cashInSystem: CashInSystem,
    private titlesSystem: TitlesSystem,
    private vendettaSystem: VendettaSystem,
    private sendQueue: SendQueue
  ) {}

  async handleCommand(context: CommandContext): Promise<void> {
    const { username, userId, args } = context;
    const command = args[0]?.toLowerCase();

    if (!userId) {
      // Try to get or create user
      let user = this.repo.getUserByTwitchName(username);
      if (!user) {
        // User needs to create character first
        if (command !== 'create') {
          this.sendQueue.enqueue(`@${username} You need to create a character first with !create <callsign>`, 1);
          return;
        }
      } else {
        context.userId = user.id;
      }
    }

    switch (command) {
      case 'create':
        await this.handleCreate(context);
        break;
      case 'profile':
        await this.handleProfile(context);
        break;
      case 'join':
        await this.handleJoin(context);
        break;
      case 'loadout':
        await this.handleLoadout(context);
        break;
      case 'sell':
        await this.handleSell(context);
        break;
      case 'cashin':
        await this.handleCashIn(context);
        break;
      case 'titles':
        await this.handleTitles(context);
        break;
      case 'buytitle':
        await this.handleBuyTitle(context);
        break;
      case 'settitle':
        await this.handleSetTitle(context);
        break;
      case 'vendetta':
        await this.handleVendetta(context);
        break;
      case 'redemptions':
        await this.handleRedemptions(context);
        break;
      case 'approve':
        await this.handleApprove(context);
        break;
      case 'deny':
        await this.handleDeny(context);
        break;
      case 'complete':
        await this.handleComplete(context);
        break;
      default:
        // Unknown command - silently ignore
        break;
    }
  }

  private async handleCreate(context: CommandContext) {
    const { username, args } = context;
    const callsign = args.slice(1).join(' ').trim();

    if (!callsign || callsign.length < 2) {
      this.sendQueue.enqueue(`@${username} Usage: !create <callsign> (2+ characters)`, 1);
      return;
    }

    const existing = this.repo.getUserByTwitchName(username);
    if (existing) {
      this.sendQueue.enqueue(`@${username} You already have a character! Use !profile to view.`, 1);
      return;
    }

    const userId = this.repo.createUser(username, callsign);
    const title = this.repo.getTitleById(1); // Rookie I
    if (title) {
      this.repo.purchaseTitle(userId, title.id);
      this.repo.setActiveTitle(userId, title.id);
    }

    this.sendQueue.enqueue(`@${username} Character created! Callsign: ${callsign}. Welcome, Rookie!`, 5);
  }

  private async handleProfile(context: CommandContext) {
    const { username, args, userId } = context;
    if (!userId) return;

    let targetUser = this.repo.getUserById(userId);
    if (args.length > 1) {
      const targetName = args[1].replace('@', '').toLowerCase();
      targetUser = this.repo.getUserByTwitchName(targetName);
      if (!targetUser) {
        this.sendQueue.enqueue(`@${username} User not found.`, 1);
        return;
      }
    }

    if (!targetUser) return;

    const title = targetUser.activeTitleId
      ? this.repo.getTitleById(targetUser.activeTitleId)
      : null;
    const titleBadge = title ? `[${title.name}]` : '';

    const extractRate = targetUser.raidsPlayed > 0
      ? ((targetUser.extracts / targetUser.raidsPlayed) * 100).toFixed(1)
      : '0.0';

    const lastRaid = this.repo.getCurrentRaid(); // Simplified - would need to get last completed raid
    const inventory = this.repo.getUserInventory(targetUser.id);
    const topItems = inventory.slice(0, 3).map(i => `${i.itemName} (${i.quantity})`).join(', ');
    const moreCount = Math.max(0, inventory.length - 3);

    let profile = `${titleBadge} ${targetUser.callsign || targetUser.twitchName} | `;
    profile += `Raids: ${targetUser.raidsPlayed} | Extracts: ${targetUser.extracts} | Deaths: ${targetUser.deaths} | Rate: ${extractRate}% | `;
    profile += `Cred: ${targetUser.credits} | Lifetime: +${targetUser.lifetimeCredEarned} / -${targetUser.lifetimeCredSpent}`;

    if (targetUser.killsCredited > 0 || targetUser.deathsAttributed > 0) {
      profile += ` | PvP: ${targetUser.killsCredited}K/${targetUser.deathsAttributed}D`;
    }

    this.sendQueue.enqueue(profile, 3);

    if (topItems) {
      const itemsLine = `Items: ${topItems}${moreCount > 0 ? ` +${moreCount} more` : ''}`;
      this.sendQueue.enqueue(itemsLine, 2);
    }
  }

  private async handleJoin(context: CommandContext) {
    const { username, userId } = context;
    if (!userId) return;

    if (!this.raidScheduler.canJoinRaid()) {
      this.sendQueue.enqueue(`@${username} No raid is currently open.`, 1);
      return;
    }

    const raid = this.raidScheduler.getCurrentRaid();
    if (!raid) return;

    const user = this.repo.getUserById(userId);
    if (!user) return;

    // Determine loadout (default to LOOTING if not set)
    let loadout = 'LOOTING';
    const existingParticipant = this.repo.getRaidParticipants(raid.id).find(p => p.userId === userId);
    if (existingParticipant) {
      loadout = existingParticipant.loadout;
    } else if (!user.hasUsedFreeLoadout) {
      loadout = 'FREE';
      this.repo.updateUserStats(userId, { hasUsedFreeLoadout: true });
    }

    this.repo.addRaidParticipant(raid.id, userId, loadout);
    this.sendQueue.enqueue(`@${username} Joined raid! Loadout: ${loadout}. Use !loadout to change.`, 3);
  }

  private async handleLoadout(context: CommandContext) {
    const { username, userId, args } = context;
    if (!userId) return;

    const loadout = args[1]?.toUpperCase();
    if (!loadout || !['PVP', 'PVE', 'LOOTING'].includes(loadout)) {
      this.sendQueue.enqueue(`@${username} Usage: !loadout pvp | pve | looting`, 1);
      return;
    }

    const raid = this.raidScheduler.getCurrentRaid();
    if (!raid) {
      this.sendQueue.enqueue(`@${username} Loadout set to ${loadout} for next raid.`, 1);
      return;
    }

    if (!this.raidScheduler.canChangeLoadout()) {
      this.sendQueue.enqueue(`@${username} Loadouts are locked! Set to ${loadout} for next raid.`, 1);
      return;
    }

    const participants = this.repo.getRaidParticipants(raid.id);
    const existing = participants.find(p => p.userId === userId);
    if (existing) {
      // Update existing
      this.repo.addRaidParticipant(raid.id, userId, loadout);
      this.sendQueue.enqueue(`@${username} Loadout changed to ${loadout} for current raid.`, 2);
    } else {
      // Join with loadout
      this.repo.addRaidParticipant(raid.id, userId, loadout);
      this.sendQueue.enqueue(`@${username} Joined raid with ${loadout} loadout!`, 2);
    }
  }

  private async handleSell(context: CommandContext) {
    const { username, userId } = context;
    if (!userId) return;

    const result = this.economy.sellAllItems(userId);
    if (result.itemCount === 0) {
      this.sendQueue.enqueue(`@${username} No items to sell.`, 1);
      return;
    }

    const user = this.repo.getUserById(userId);
    const title = user?.activeTitleId ? this.repo.getTitleById(user.activeTitleId) : null;
    const titleBadge = title ? `[${title.name}]` : '';

    this.sendQueue.enqueue(
      `${titleBadge} ${user?.callsign || username} sold ${result.itemCount} items for ${result.totalCred} Cred.`,
      5
    );
  }

  private async handleCashIn(context: CommandContext) {
    const { username, userId, args } = context;
    if (!userId) return;

    const option = args[1]?.toLowerCase();
    if (!option) {
      this.sendQueue.enqueue(`@${username} Usage: !cashin <option>`, 1);
      return;
    }

    const result = this.cashInSystem.processCashIn(userId, option);
    if (!result.success) {
      this.sendQueue.enqueue(`@${username} ${result.message}`, 1);
      return;
    }

    if (result.redemptionId) {
      const cashInOption = this.config.cashin.options[option];
      this.sendQueue.enqueue(
        `@${this.config.twitch.channel} ${username} requested ${cashInOption.description}. Broadcaster type !approve or !deny.`,
        8
      );
    } else if (result.message) {
      this.sendQueue.enqueue(result.message, 5);
    }
  }

  private async handleTitles(context: CommandContext) {
    const { username, userId } = context;
    if (!userId) return;

    const allTitles = this.titlesSystem.getAllTitles();
    const ownedTitles = this.titlesSystem.getUserTitles(userId);
    const ownedIds = new Set(ownedTitles.map(t => t.id));
    const nextTitle = this.titlesSystem.getNextTitle(userId);

    let response = `@${username} Titles: `;
    const titleList: string[] = [];
    for (const title of allTitles) {
      const owned = ownedIds.has(title.id);
      const active = this.repo.getUserById(userId)?.activeTitleId === title.id;
      let marker = owned ? (active ? '★' : '✓') : '○';
      titleList.push(`${marker} ${title.name}${title.cost > 0 ? ` (${title.cost})` : ''}`);
    }
    response += titleList.join(' | ');

    if (nextTitle) {
      response += ` | Next: ${nextTitle.name} (${nextTitle.cost} Cred)`;
    }

    this.sendQueue.enqueue(response, 2);
  }

  private async handleBuyTitle(context: CommandContext) {
    const { username, userId } = context;
    if (!userId) return;

    const result = this.titlesSystem.purchaseNextTitle(userId);
    if (result.success) {
      this.sendQueue.enqueue(`@${username} ${result.message}`, 3);
    } else {
      this.sendQueue.enqueue(`@${username} ${result.message}`, 1);
    }
  }

  private async handleSetTitle(context: CommandContext) {
    const { username, userId, args } = context;
    if (!userId) return;

    const titleName = args.slice(1).join(' ');
    if (!titleName) {
      this.sendQueue.enqueue(`@${username} Usage: !settitle <title name>`, 1);
      return;
    }

    const result = this.titlesSystem.setActiveTitle(userId, titleName);
    if (result.success) {
      this.sendQueue.enqueue(`@${username} ${result.message}`, 2);
    } else {
      this.sendQueue.enqueue(`@${username} ${result.message}`, 1);
    }
  }

  private async handleVendetta(context: CommandContext) {
    const { username, userId, args } = context;
    if (!userId) return;

    if (args.length > 1) {
      // Head-to-head
      const targetName = args[1].replace('@', '').toLowerCase();
      const targetUser = this.repo.getUserByTwitchName(targetName);
      if (!targetUser) {
        this.sendQueue.enqueue(`@${username} User not found.`, 1);
        return;
      }

      const h2h = this.vendettaSystem.getHeadToHead(userId, targetUser.id);
      if (!h2h) {
        this.sendQueue.enqueue(`@${username} Could not retrieve head-to-head stats.`, 1);
        return;
      }

      this.sendQueue.enqueue(
        `@${username} ${h2h.user1.name} ${h2h.user1.kills} - ${h2h.user2.kills} ${h2h.user2.name}`,
        2
      );
    } else {
      // Personal vendetta stats
      const stats = this.vendettaSystem.getVendettaStats(userId);
      let response = `@${username} Vendetta: ${stats.killsCredited}K / ${stats.deathsAttributed}D`;
      if (stats.topNemesis) {
        response += ` | Nemesis: ${stats.topNemesis.name} (${stats.topNemesis.kills})`;
      }
      if (stats.topVictim) {
        response += ` | Top Victim: ${stats.topVictim.name} (${stats.topVictim.kills})`;
      }
      this.sendQueue.enqueue(response, 2);
    }
  }

  private async handleRedemptions(context: CommandContext) {
    const { username } = context;
    // Check if broadcaster (simplified - would need proper auth)
    const redemptions = this.repo.getPendingRedemptions();
    if (redemptions.length === 0) {
      this.sendQueue.enqueue(`@${username} No pending redemptions.`, 1);
      return;
    }

    let response = `@${username} Pending: `;
    const list = redemptions.slice(0, 5).map(r => {
      const option = this.config.cashin.options[r.type];
      return `#${r.id} ${r.callsign || r.twitchName} - ${option?.description || r.type} (${r.cost} Cred)`;
    }).join(' | ');
    response += list;
    this.sendQueue.enqueue(response, 3);
  }

  private async handleApprove(context: CommandContext) {
    const { username, args } = context;
    const redemptionId = parseInt(args[1]);
    if (isNaN(redemptionId)) {
      this.sendQueue.enqueue(`@${username} Usage: !approve <redemptionId>`, 1);
      return;
    }

    const redemption = this.repo.getRedemption(redemptionId);
    if (!redemption) {
      this.sendQueue.enqueue(`@${username} Redemption not found.`, 1);
      return;
    }

    if (redemption.status !== 'pending') {
      this.sendQueue.enqueue(`@${username} Redemption already processed.`, 1);
      return;
    }

    this.repo.approveRedemption(redemptionId, username);
    const user = this.repo.getUserById(redemption.userId);
    this.sendQueue.enqueue(
      `✅ Redemption #${redemptionId} approved for ${user?.callsign || user?.twitchName || 'Unknown'}.`,
      5
    );
  }

  private async handleDeny(context: CommandContext) {
    const { username, args } = context;
    const redemptionId = parseInt(args[1]);
    if (isNaN(redemptionId)) {
      this.sendQueue.enqueue(`@${username} Usage: !deny <redemptionId>`, 1);
      return;
    }

    const redemption = this.repo.getRedemption(redemptionId);
    if (!redemption) {
      this.sendQueue.enqueue(`@${username} Redemption not found.`, 1);
      return;
    }

    if (redemption.status !== 'pending') {
      this.sendQueue.enqueue(`@${username} Redemption already processed.`, 1);
      return;
    }

    this.repo.denyRedemption(redemptionId);
    this.economy.refundCredits(redemption.userId, redemption.cost);
    const user = this.repo.getUserById(redemption.userId);
    this.sendQueue.enqueue(
      `❌ Redemption #${redemptionId} denied. ${redemption.cost} Cred refunded to ${user?.callsign || user?.twitchName || 'Unknown'}.`,
      5
    );
  }

  private async handleComplete(context: CommandContext) {
    const { username, args } = context;
    const redemptionId = parseInt(args[1]);
    if (isNaN(redemptionId)) {
      this.sendQueue.enqueue(`@${username} Usage: !complete <redemptionId>`, 1);
      return;
    }

    const redemption = this.repo.getRedemption(redemptionId);
    if (!redemption) {
      this.sendQueue.enqueue(`@${username} Redemption not found.`, 1);
      return;
    }

    if (redemption.status !== 'approved') {
      this.sendQueue.enqueue(`@${username} Redemption must be approved first.`, 1);
      return;
    }

    this.repo.completeRedemption(redemptionId);
    const user = this.repo.getUserById(redemption.userId);
    this.sendQueue.enqueue(
      `✅ Redemption #${redemptionId} marked complete for ${user?.callsign || user?.twitchName || 'Unknown'}.`,
      3
    );
  }
}
