import { Repo } from '../db/repo';

export class Economy {
  constructor(private repo: Repo) {}

  sellAllItems(userId: number): { totalCred: number; itemCount: number } {
    const inventory = this.repo.getUserInventory(userId);
    let totalCred = 0;
    let itemCount = 0;

    for (const item of inventory) {
      const sellValue = item.sellValueCred || 0; // Fallback to 0 if missing
      const value = sellValue * item.quantity;
      totalCred += value;
      itemCount += item.quantity;
    }

    // Update user credits
    const user = this.repo.getUserById(userId);
    if (user) {
      const newCredits = user.credits + totalCred;
      const newLifetimeEarned = user.lifetimeCredEarned + totalCred;
      this.repo.updateUserCredits(userId, newCredits, newLifetimeEarned, user.lifetimeCredSpent);
    }

    // Clear inventory
    this.repo.clearInventory(userId);

    return { totalCred, itemCount };
  }

  spendCredits(userId: number, amount: number): boolean {
    const user = this.repo.getUserById(userId);
    if (!user || user.credits < amount) {
      return false;
    }

    const newCredits = user.credits - amount;
    const newLifetimeSpent = user.lifetimeCredSpent + amount;
    this.repo.updateUserCredits(userId, newCredits, user.lifetimeCredEarned, newLifetimeSpent);
    return true;
  }

  refundCredits(userId: number, amount: number) {
    const user = this.repo.getUserById(userId);
    if (!user) return;

    const newCredits = user.credits + amount;
    const newLifetimeSpent = Math.max(0, user.lifetimeCredSpent - amount);
    this.repo.updateUserCredits(userId, newCredits, user.lifetimeCredEarned, newLifetimeSpent);
  }
}
