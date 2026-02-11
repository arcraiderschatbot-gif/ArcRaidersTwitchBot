import { Repo } from '../db/repo';
import { Config, CashInOption } from '../config';
import { Economy } from './economy';

export class CashInSystem {
  private pingCooldowns: Map<number, number> = new Map();

  constructor(
    private repo: Repo,
    private config: Config,
    private economy: Economy
  ) {}

  canCashIn(userId: number, option: string): { allowed: boolean; reason?: string } {
    const cashInOption = this.config.cashin.options[option];
    if (!cashInOption) {
      return { allowed: false, reason: 'Unknown cash-in option' };
    }

    const user = this.repo.getUserById(userId);
    if (!user) {
      return { allowed: false, reason: 'User not found' };
    }

    if (user.credits < cashInOption.cost) {
      return { allowed: false, reason: 'Insufficient credits' };
    }

    // Check ping cooldown
    if (option.startsWith('ping')) {
      const lastPing = this.pingCooldowns.get(userId) || 0;
      const cooldownMs = this.config.cashin.pingCooldownSeconds * 1000;
      if (Date.now() - lastPing < cooldownMs) {
        const remaining = Math.ceil((cooldownMs - (Date.now() - lastPing)) / 1000);
        return { allowed: false, reason: `Ping cooldown: ${remaining}s remaining` };
      }
    }

    return { allowed: true };
  }

  processCashIn(userId: number, option: string, customText?: string): { success: boolean; redemptionId?: number; message?: string } {
    const check = this.canCashIn(userId, option);
    if (!check.allowed) {
      return { success: false, message: check.reason };
    }

    const cashInOption = this.config.cashin.options[option];
    if (!cashInOption) {
      return { success: false, message: 'Unknown option' };
    }

    // Deduct credits
    if (!this.economy.spendCredits(userId, cashInOption.cost)) {
      return { success: false, message: 'Failed to deduct credits' };
    }

    // Update ping cooldown
    if (option.startsWith('ping')) {
      this.pingCooldowns.set(userId, Date.now());
      const user = this.repo.getUserById(userId);
      if (user) {
        this.repo.updateUserStats(userId, { pingCount: (user.pingCount || 0) + 1 });
      }
    }

    // Shoutout with custom text always requires approval for display
    const needsApproval = (cashInOption.requiresApproval && this.config.game.streamerApprovalRequired) ||
                          (option === 'shoutout' && customText);
    
    if (needsApproval) {
      const redemptionId = this.repo.createRedemption(userId, option, cashInOption.cost, customText);
      return {
        success: true,
        redemptionId,
        message: `Redemption requested. Awaiting broadcaster approval.`,
      };
    }

    // Auto-approve automated cash-ins
    return {
      success: true,
      message: this.getCashInMessage(option, userId, customText),
    };
  }

  private getCashInMessage(option: string, userId: number, customText?: string): string {
    const user = this.repo.getUserById(userId);
    const name = user?.callsign || user?.twitchName || 'Unknown';

    const messages: Record<string, string> = {
      ping: `🔔 ${name} sent a ping!`,
      ping2: `🔔 ${name} sent a ping! ⚡`,
      ping3: `🔔 ${name} sent a ping! ⚡🔥`,
      shoutout: customText 
        ? `📢 ${name} requested a shoutout!`
        : `📢 ${name} requested a shoutout!`,
      scout: `🔍 ${name} is scouting ahead!`,
      insure: `🛡️ ${name} purchased insurance!`,
      event: `🎉 ${name} triggered an event!`,
      reroll: `🎲 ${name} rerolled their last raid!`,
      mvp: `⭐ ${name} claimed MVP advantage!`,
    };

    return messages[option] || `${name} used ${option}`;
  }
}
