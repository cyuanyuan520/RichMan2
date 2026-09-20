import Peer, { type DataConnection } from "peerjs";
import type { Transport } from "./transport";

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 5;

export function randomRoomCode(): string {
  let code = "";
  const values = new Uint32Array(ROOM_CODE_LENGTH);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(values);
  } else {
    for (let i = 0; i < values.length; i += 1) {
      values[i] = Math.floor(Math.random() * ROOM_ALPHABET.length);
    }
  }
  for (const value of values) {
    code += ROOM_ALPHABET[value % ROOM_ALPHABET.length];
  }
  return code;
}

export function hostPeerId(code: string): string {
  return `richman2-${code.toLowerCase()}`;
}

export interface PeerEndpointOptions {
  host?: string;
  port?: number;
  path?: string;
  secure?: boolean;
}

export interface PeerIceConfig {
  config?: { iceServers: RTCIceServer[] };
  key?: string;
}

export function iceConfig(): PeerIceConfig {
  const config: PeerIceConfig = {};
  const raw = process.env.NEXT_PUBLIC_ICE_SERVERS;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as RTCIceServer[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        config.config = { iceServers: parsed };
      }
    } catch {
      // Ignore malformed JSON; fall back to PeerJS defaults.
    }
  }
  const key = process.env.NEXT_PUBLIC_PEERJS_KEY;
  if (key) {
    config.key = key;
  }
  return config;
}

export function peerOptions(): PeerEndpointOptions {
  const host = process.env.NEXT_PUBLIC_PEERJS_HOST;
  const port = process.env.NEXT_PUBLIC_PEERJS_PORT;
  const path = process.env.NEXT_PUBLIC_PEERJS_PATH;
  const secure = process.env.NEXT_PUBLIC_PEERJS_SECURE;
  if (!host) {
    return {};
  }
  return {
    host,
    port: port ? Number(port) : 443,
    path: path ?? "/",
    secure: secure !== "false",
  };
}

export function createRoomPeer(code: string): Peer {
  return new Peer(hostPeerId(code), {
    ...peerOptions(),
    ...iceConfig(),
    debug: 0,
  });
}

export function waitForPeerOpen(peer: Peer): Promise<string> {
  return new Promise((resolve, reject) => {
    peer.on("open", (id) => resolve(id));
    peer.on("error", (error) => reject(error));
    if (peer.open) {
      resolve(peer.id);
    }
  });
}

export function connectToRoom(
  code: string,
  timeoutMs = 15000,
): Promise<DataConnection> {
  return connectRoom(code, timeoutMs).then((result) => result.connection);
}

export interface RoomConnection {
  connection: DataConnection;
  peer: Peer;
}

export function connectRoom(code: string, timeoutMs = 15000): Promise<RoomConnection> {
  return new Promise((resolve, reject) => {
    const peer = new Peer({ ...peerOptions(), ...iceConfig(), debug: 0 });
    const timer = setTimeout(() => {
      peer.destroy();
      reject(new Error("连接超时，请确认房间号是否正确"));
    }, timeoutMs);
    peer.on("open", () => {
      const connection = peer.connect(hostPeerId(code), { reliable: true });
      connection.on("open", () => {
        clearTimeout(timer);
        resolve({ connection, peer });
      });
      connection.on("error", (error) => {
        clearTimeout(timer);
        peer.destroy();
        reject(error);
      });
    });
    peer.on("error", (error) => {
      clearTimeout(timer);
      peer.destroy();
      reject(error);
    });
  });
}

export function peerTransport(connection: DataConnection): Transport {
  let messageHandler: ((message: unknown) => void) | null = null;
  let closeHandler: (() => void) | null = null;
  connection.on("data", (data) => messageHandler?.(data));
  connection.on("close", () => closeHandler?.());
  connection.on("error", () => closeHandler?.());
  return {
    label: connection.peer,
    send(message: unknown): void {
      if (connection.open) {
        connection.send(message);
      }
    },
    onMessage(handler: (message: unknown) => void): void {
      messageHandler = handler;
    },
    onClose(handler: () => void): void {
      closeHandler = handler;
    },
    isOpen(): boolean {
      return connection.open;
    },
    close(): void {
      connection.close();
    },
  };
}
