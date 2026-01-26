import { Config } from '../config';

export class SendQueue {
  private queue: Array<{ message: string; priority: number }> = [];
  private isProcessing = false;
  private lastSentTime = 0;
  private globalMessageCount = 0;
  private globalWindowStart = Date.now();
  private channelLastSent = 0;

  constructor(private config: Config, private sendFn: (msg: string) => void) {}

  enqueue(message: string, priority: number = 0) {
    this.queue.push({ message, priority });
    this.queue.sort((a, b) => b.priority - a.priority);
    this.process();
  }

  private async process() {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      // Check global rate limit (20 messages per 30 seconds)
      const now = Date.now();
      if (now - this.globalWindowStart >= 30000) {
        this.globalMessageCount = 0;
        this.globalWindowStart = now;
      }

      if (this.globalMessageCount >= this.config.rateLimits.globalMessagesPer30s) {
        await this.sleep(30000 - (now - this.globalWindowStart));
        this.globalMessageCount = 0;
        this.globalWindowStart = Date.now();
      }

      // Check per-channel rate limit (1 message per second)
      const timeSinceLastSent = now - this.channelLastSent;
      if (timeSinceLastSent < 1000) {
        await this.sleep(1000 - timeSinceLastSent);
      }

      const item = this.queue.shift();
      if (item) {
        this.sendFn(item.message);
        this.lastSentTime = Date.now();
        this.channelLastSent = Date.now();
        this.globalMessageCount++;
      }
    }

    this.isProcessing = false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  clear() {
    this.queue = [];
  }
}
