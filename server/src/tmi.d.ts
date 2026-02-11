declare module 'tmi.js' {
  interface Client {
    connect(): Promise<[string, number]>;
    disconnect(): void;
    say(channel: string, message: string): Promise<void>;
    on(event: string, callback: (...args: any[]) => void): void;
  }
  interface Options {
    options?: { debug?: boolean };
    connection?: { reconnect?: boolean; secure?: boolean };
    identity?: { username: string; password: string };
    channels?: string[];
  }
  function Client(opts: Options): Client;
}
