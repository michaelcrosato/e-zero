import type { DataConnection, Peer, PeerOptions } from 'peerjs';
import { PROTOCOL, ROOM_PATTERN, parseMessage, type Message, type Motion } from './protocol';
import { Room } from './room';
import { online, remoteCraft, syncRemoteCraft } from './state';

const PREFIX = 'ezero-v1-';
const TIMEOUT = 12_000;

interface Link {
  connection: DataConnection;
  lastSeen: number;
  joined: boolean;
}
interface Hooks {
  changed(): void;
  status(message: string): void;
  start(delay: number): void;
  lobby(): void;
  left(): void;
  motion(): Omit<Motion, 'seq' | 'finishedAt'> & { finishedAt: number | null };
  countdown(delay: number): void;
}

/** Only the host accepts members, starts rounds and publishes the roster. */
export class Session {
  private peer: Peer | null = null;
  private room: Room | null = null;
  private links = new Map<string, Link>();
  private timer = 0;
  private generation = 0;
  private deadline = 0;
  private clockOffset = 0;
  private bestRtt = Infinity;
  private startAt = 0;
  private seq = 0;
  private lastPing = 0;
  private finishedAt: number | null = null;
  private connected = false;

  constructor(private hooks: Hooks) {}

  async connect(name: string, code?: string): Promise<void> {
    this.close();
    const generation = this.generation;
    online.active = true;
    online.host = !code;
    online.code =
      code ??
      Array.from(
        crypto.getRandomValues(new Uint8Array(8)),
        (n) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[n % 32],
      ).join('');
    // Public signaling by default; a build-time override supports self hosting and offline CI.
    this.hooks.status('Connecting…');
    this.hooks.changed();
    this.deadline = performance.now() + TIMEOUT;
    this.timer = window.setInterval(() => this.tick(), 50);
    try {
      const { default: PeerClient } = await import('peerjs');
      if (generation !== this.generation) return;
      const options: PeerOptions = { debug: 0 };
      const server = import.meta.env.VITE_PEER_SERVER as string | undefined;
      if (server) {
        const url = new URL(server);
        options.host = url.hostname;
        options.port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
        options.secure = url.protocol === 'https:';
        options.path = url.pathname;
      }
      const ice = import.meta.env.VITE_ICE_SERVERS as string | undefined;
      if (ice) options.config = { iceServers: JSON.parse(ice) as RTCIceServer[] };
      const peer = code ? new PeerClient(options) : new PeerClient(PREFIX + online.code, options);
      this.peer = peer;
      peer.on('open', (id) => {
        if (generation !== this.generation) return;
        // Reopening signaling must preserve an already-running room and its data channels.
        if (this.connected) return;
        online.id = id;
        if (!code) {
          this.room = new Room(id, name);
          this.connected = true;
          this.publish();
          this.hooks.status('Share the room code. Start when everyone is ready.');
        } else
          this.attach(peer.connect(PREFIX + code, { reliable: true, serialization: 'json' }), name);
      });
      peer.on('connection', (connection) => {
        if (generation !== this.generation) {
          connection.close();
          return;
        }
        if (!online.host) {
          connection.close();
          return;
        }
        this.attach(connection, name);
      });
      peer.on('error', (error) => {
        if (generation !== this.generation) return;
        if (this.connected && error.type === 'peer-unavailable') return;
        this.fail(
          error.type === 'peer-unavailable'
            ? 'Room not found. Check the code and ask the host to keep the room open.'
            : error.type === 'unavailable-id'
              ? 'Room code is already in use. Create another room.'
              : 'Connection failed. Try again or switch networks.',
        );
      });
      peer.on('disconnected', () => {
        if (generation === this.generation && !peer.destroyed) peer.reconnect();
      });
    } catch {
      if (generation === this.generation)
        this.fail('Could not connect. Check your connection and try again.');
    }
  }

  private attach(connection: DataConnection, name: string): void {
    const generation = this.generation;
    if (this.links.has(connection.peer) || this.links.size >= 8) {
      connection.close();
      return;
    }
    const link: Link = { connection, lastSeen: performance.now(), joined: false };
    this.links.set(connection.peer, link);
    connection.on('open', () => {
      if (generation !== this.generation) {
        connection.close();
        return;
      }
      if (!online.host) {
        this.send(connection, { type: 'hello', version: PROTOCOL, name: name.trim().slice(0, 16) });
        this.ping();
      }
    });
    connection.on('data', (data: unknown) => {
      if (generation !== this.generation) return;
      const message = parseMessage(data);
      if (!message) return;
      link.lastSeen = performance.now();
      this.receive(link, message);
    });
    const lost = (): void => {
      if (generation !== this.generation || this.links.get(connection.peer) !== link) return;
      this.links.delete(connection.peer);
      if (online.host) {
        this.room?.leave(connection.peer);
        this.publish();
      } else this.fail('The host disconnected. Create or join another room.');
    };
    connection.on('close', lost);
    connection.on('error', lost);
  }

  private send(connection: DataConnection, message: Message): void {
    // Bound latency and memory if a suspended browser stops draining its data channel.
    if (!connection.open) return;
    if (
      (message.type === 'room' || message.type === 'state') &&
      connection.dataChannel.bufferedAmount > 64_000
    )
      return;
    try {
      connection.send(message);
    } catch {
      connection.close();
    }
  }

  private receive(link: Link, message: Message): void {
    const connection = link.connection;
    if (online.host && this.room) {
      if (message.type === 'hello' && !link.joined) {
        const error = this.room.join(connection.peer, message.name, message.version);
        if (error) {
          this.send(connection, { type: 'reject', reason: error });
          // Allow the reliable channel to deliver the reason before closing it.
          window.setTimeout(() => connection.close(), 250);
        } else {
          link.joined = true;
          this.publish();
        }
      } else if (link.joined) {
        if (message.type === 'ping')
          this.send(connection, { type: 'pong', sent: message.sent, hostTime: performance.now() });
        if (message.type === 'ready') {
          this.room.ready(connection.peer, message.ready);
          this.publish();
        }
        if (message.type === 'state')
          this.room.motion(connection.peer, message.round, message.motion);
      }
      return;
    }
    if (message.type === 'reject') {
      this.fail(message.reason);
      return;
    }
    if (message.type === 'pong') {
      const now = performance.now();
      const rtt = now - message.sent;
      if (rtt >= 0 && rtt < this.bestRtt) {
        this.bestRtt = rtt;
        this.clockOffset = message.hostTime - (message.sent + now) / 2;
      }
      this.hooks.changed();
    }
    if (message.type === 'room') {
      if (!message.racers.some((r) => r.id === online.id) || message.round < online.round) return;
      const backToLobby = online.racing && message.phase === 'lobby';
      this.connected = true;
      link.joined = true;
      online.phase = message.phase;
      online.round = message.round;
      online.racers = message.racers;
      if (backToLobby) {
        online.racing = false;
        remoteCraft.length = 0;
        this.hooks.lobby();
      }
      syncRemoteCraft();
      this.hooks.changed();
      if (!online.racing) this.hooks.status('Press Ready when you are ready to race.');
    }
    if (message.type === 'start' && message.round > online.round && this.connected) {
      online.round = message.round;
      online.racers = message.racers;
      this.begin(message.at - this.clockOffset);
    }
  }

  private begin(at: number): void {
    this.startAt = at;
    this.seq = 0;
    this.finishedAt = null;
    online.phase = 'racing';
    online.racing = true;
    remoteCraft.length = 0;
    syncRemoteCraft();
    this.hooks.start(Math.max(0, (at - performance.now()) / 1000));
    this.hooks.changed();
  }

  private publish(): void {
    if (!this.room) return;
    const message = this.room.message();
    online.racers = this.room.racers.map((r) => ({ ...r }));
    online.phase = this.room.phase;
    online.round = this.room.round;
    for (const { connection, joined } of this.links.values())
      if (joined) this.send(connection, message);
    syncRemoteCraft();
    this.hooks.changed();
  }

  private ping(): void {
    const sent = performance.now();
    this.lastPing = sent;
    for (const { connection } of this.links.values()) this.send(connection, { type: 'ping', sent });
  }

  private tick(): void {
    const now = performance.now();
    if (online.racing) this.hooks.countdown(Math.max(0, (this.startAt - now) / 1000));
    if (!this.connected && now > this.deadline) {
      this.fail('Connection timed out. Check the room code or try another network.');
      return;
    }
    for (const [id, link] of this.links) {
      if (now - link.lastSeen > TIMEOUT) {
        this.links.delete(id);
        link.connection.close();
        if (online.host) {
          this.room?.leave(id);
          this.publish();
        } else {
          this.fail('Connection to the host was lost. Join another room.');
          return;
        }
      }
    }
    if (!online.host && now - this.lastPing > 1000) this.ping();
    if (online.racing && online.phase === 'racing' && now >= this.startAt) {
      const motion = this.hooks.motion();
      // Wall time prevents a slow or backgrounded tab from earning an artificially fast finish.
      if (motion.finishedAt !== null && this.finishedAt === null)
        this.finishedAt = (now - this.startAt) / 1000;
      const packet = { ...motion, finishedAt: this.finishedAt, seq: ++this.seq };
      if (online.host) this.room?.motion(online.id, online.round, packet);
      else
        for (const { connection } of this.links.values())
          this.send(connection, { type: 'state', round: online.round, motion: packet });
    }
    if (online.host && this.connected) this.publish();
  }

  get canReady(): boolean {
    return this.connected && (online.host || Number.isFinite(this.bestRtt));
  }
  get canStart(): boolean {
    return this.room?.canStart ?? false;
  }

  ready(value: boolean): void {
    if (!this.canReady || online.phase !== 'lobby') return;
    if (online.host) {
      this.room?.ready(online.id, value);
      this.publish();
    } else
      for (const { connection } of this.links.values())
        this.send(connection, { type: 'ready', ready: value });
  }

  start(): void {
    if (!this.room?.start()) return;
    const at = performance.now() + 3200;
    online.round = this.room.round;
    online.racers = this.room.racers.map((r) => ({ ...r }));
    for (const { connection, joined } of this.links.values())
      if (joined)
        this.send(connection, { type: 'start', round: this.room.round, at, racers: online.racers });
    this.begin(at);
    this.publish();
  }

  rematch(): void {
    if (!this.room?.rematch()) return;
    online.racing = false;
    remoteCraft.length = 0;
    this.hooks.lobby();
    this.publish();
  }

  close(): void {
    this.generation++;
    window.clearInterval(this.timer);
    this.links.clear();
    this.peer?.destroy();
    this.peer = null;
    this.room = null;
    this.connected = false;
    this.bestRtt = Infinity;
    this.clockOffset = 0;
    online.active = false;
    online.racing = false;
    online.phase = 'lobby';
    online.racers = [];
    online.id = '';
    online.code = '';
    online.round = 0;
    remoteCraft.length = 0;
  }

  leave(): void {
    this.close();
    this.hooks.left();
    this.hooks.changed();
  }
  private fail(reason: string): void {
    this.leave();
    this.hooks.status(reason);
  }
}

export function normalizeCode(value: string): string | null {
  const code = value.trim().toUpperCase();
  return ROOM_PATTERN.test(code) ? code : null;
}
