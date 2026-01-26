import { Repo } from '../db/repo';
import { Economy } from './economy';

export class TitlesSystem {
  constructor(
    private repo: Repo,
    private economy: Economy
  ) {}

  getNextTitle(userId: number) {
    return this.repo.getNextTitleForUser(userId);
  }

  getAllTitles() {
    return this.repo.getAllTitles();
  }

  getUserTitles(userId: number) {
    return this.repo.getUserTitles(userId);
  }

  purchaseNextTitle(userId: number): { success: boolean; message?: string } {
    const nextTitle = this.getNextTitle(userId);
    if (!nextTitle) {
      return { success: false, message: 'No more titles available' };
    }

    const user = this.repo.getUserById(userId);
    if (!user) {
      return { success: false, message: 'User not found' };
    }

    if (user.credits < nextTitle.cost) {
      return { success: false, message: `Insufficient credits. Need ${nextTitle.cost}, have ${user.credits}` };
    }

    if (!this.economy.spendCredits(userId, nextTitle.cost)) {
      return { success: false, message: 'Failed to purchase title' };
    }

    this.repo.purchaseTitle(userId, nextTitle.id);
    return { success: true, message: `Purchased ${nextTitle.name}!` };
  }

  setActiveTitle(userId: number, titleName: string): { success: boolean; message?: string } {
    const user = this.repo.getUserById(userId);
    if (!user) {
      return { success: false, message: 'User not found' };
    }

    const allTitles = this.getAllTitles();
    const title = allTitles.find(t => t.name.toLowerCase() === titleName.toLowerCase());
    if (!title) {
      return { success: false, message: 'Title not found' };
    }

    const ownedTitles = this.getUserTitles(userId);
    const isOwned = ownedTitles.some(t => t.id === title.id);
    if (!isOwned) {
      return { success: false, message: 'You do not own this title' };
    }

    this.repo.setActiveTitle(userId, title.id);
    return { success: true, message: `Active title set to ${title.name}` };
  }
}
