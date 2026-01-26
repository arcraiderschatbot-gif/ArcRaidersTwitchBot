// Twitch Extensions Helper wrapper
export interface TwitchExt {
  onAuthorized: (callback: (auth: { token: string; channelId: string; userId: string }) => void) => void;
  onContext: (callback: (context: any) => void) => void;
  onVisibilityChanged: (callback: (isVisible: boolean) => void) => void;
  onHighlightChanged: (callback: (isHighlighted: boolean) => void) => void;
  send: (target: string, contentType: string, message: any) => void;
  listen: (target: string, callback: (target: string, contentType: string, message: any) => void) => void;
  rig: {
    log: (message: string) => void;
  };
}

declare global {
  interface Window {
    Twitch?: {
      ext: TwitchExt;
    };
  }
}

export class TwitchHelper {
  private token: string | null = null;
  private channelId: string | null = null;
  private userId: string | null = null;
  private listeners: Array<(auth: { token: string; channelId: string; userId: string }) => void> = [];

  constructor() {
    if (window.Twitch && window.Twitch.ext) {
      window.Twitch.ext.onAuthorized((auth) => {
        this.token = auth.token;
        this.channelId = auth.channelId;
        this.userId = auth.userId;
        this.listeners.forEach(cb => cb(auth));
      });
    }
  }

  onAuthorized(callback: (auth: { token: string; channelId: string; userId: string }) => void) {
    this.listeners.push(callback);
    if (this.token && this.channelId && this.userId) {
      callback({
        token: this.token,
        channelId: this.channelId,
        userId: this.userId,
      });
    }
  }

  getToken(): string | null {
    return this.token;
  }

  getChannelId(): string | null {
    return this.channelId;
  }

  getUserId(): string | null {
    return this.userId;
  }

  isAuthorized(): boolean {
    return !!(this.token && this.channelId && this.userId);
  }
}

export const twitchHelper = new TwitchHelper();
