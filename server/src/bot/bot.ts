import tmi from 'tmi.js';
import { Repo } from '../db/repo';
import { Config } from '../config';
import { RaidScheduler } from '../game/raidScheduler';
import { RaidEngine } from '../game/raidEngine';
import { Economy } from '../game/economy';
import { CashInSystem } from '../game/cashin';
import { TitlesSystem } from '../game/titles';
import { VendettaSystem } from '../game/vendetta';
import { SendQueue } from './sendQueue';
import { CommandHandler } from './commands';

export class Bot {
  private client: tmi.Client | null = null;
  private sendQueue: SendQueue;
  private commandHandler: CommandHandler;
  private raidScheduler: RaidScheduler;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;

  constructor(
    private config: Config,
    private repo: Repo
  ) {
    const raidEngine = new RaidEngine(repo, config);
    const economy = new Economy(repo);
    const cashInSystem = new CashInSystem(repo, config, economy);
    const titlesSystem = new TitlesSystem(repo, economy);
    const vendettaSystem = new VendettaSystem(repo);

    this.sendQueue = new SendQueue(config, (msg) => {
      if (this.client) {
        this.client.say(config.twitch.channel, msg).catch(err => {
          console.error('Failed to send message:', err);
        });
      }
    });

    this.raidScheduler = new RaidScheduler(repo, config, raidEngine, this.sendQueue);
    this.commandHandler = new CommandHandler(
      repo,
      config,
      this.raidScheduler,
      economy,
      cashInSystem,
      titlesSystem,
      vendettaSystem,
      this.sendQueue
    );
  }

  async connect() {
    const client = tmi.Client({
      options: { debug: false },
      connection: {
        reconnect: false, // We handle reconnects manually
        secure: true,
      },
      identity: {
        username: this.config.twitch.username,
        password: this.config.twitch.oauthToken,
      },
      channels: [this.config.twitch.channel],
    });

    client.on('message', async (channel, tags, message, self) => {
      if (self) return; // Ignore bot's own messages

      const username = tags.username || 'unknown';
      const user = this.repo.getUserByTwitchName(username);
      const userId = user?.id;

      // Parse command
      if (message.startsWith('!')) {
        const parts = message.slice(1).trim().split(/\s+/);
        const command = parts[0];
        const args = parts;

        await this.commandHandler.handleCommand({
          username,
          userId,
          message,
          args,
        });
      }
    });

    client.on('connected', (addr, port) => {
      console.log(`Connected to Twitch IRC at ${addr}:${port}`);
      this.reconnectAttempts = 0;
      this.raidScheduler.start();
    });

    client.on('disconnected', (reason) => {
      console.log(`Disconnected: ${reason}`);
      this.raidScheduler.stop();
      this.attemptReconnect();
    });

    client.on('reconnect', () => {
      console.log('Reconnecting...');
    });

    try {
      await client.connect();
      this.client = client;
    } catch (error) {
      console.error('Failed to connect:', error);
      this.attemptReconnect();
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnect attempts reached. Stopping bot.');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(30000 * Math.pow(2, this.reconnectAttempts - 1), 300000); // Exponential backoff, max 5 min
    const jitter = Math.random() * 1000; // Add jitter
    const totalDelay = delay + jitter;

    console.log(`Reconnecting in ${Math.round(totalDelay / 1000)}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    setTimeout(() => {
      this.connect().catch(err => {
        console.error('Reconnect failed:', err);
        this.attemptReconnect();
      });
    }, totalDelay);
  }

  disconnect() {
    this.raidScheduler.stop();
    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }
  }

  getSendQueue() {
    return this.sendQueue;
  }

  getRaidScheduler() {
    return this.raidScheduler;
  }
}
