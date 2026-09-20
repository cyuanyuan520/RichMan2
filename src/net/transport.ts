export interface Transport {
  readonly label: string;
  send(message: unknown): void;
  onMessage(handler: (message: unknown) => void): void;
  onClose(handler: () => void): void;
  isOpen(): boolean;
  close(): void;
}

interface MemorySide {
  peer: MemoryTransport | null;
  inbox: unknown[];
  closed: boolean;
}

class MemoryTransport implements Transport {
  readonly label: string;
  private side: MemorySide;
  private messageHandler: ((message: unknown) => void) | null = null;
  private closeHandler: (() => void) | null = null;

  constructor(label: string, side: MemorySide) {
    this.label = label;
    this.side = side;
  }

  send(message: unknown): void {
    const peer = this.side.peer;
    if (!peer || this.side.closed) {
      return;
    }
    peer.deliver(message);
  }

  deliver(message: unknown): void {
    queueMicrotask(() => {
      if (!this.side.closed) {
        this.messageHandler?.(message);
      }
    });
  }

  onMessage(handler: (message: unknown) => void): void {
    this.messageHandler = handler;
    const queued = this.side.inbox.splice(0, this.side.inbox.length);
    for (const message of queued) {
      this.deliver(message);
    }
  }

  onClose(handler: () => void): void {
    this.closeHandler = handler;
  }

  isOpen(): boolean {
    return !this.side.closed;
  }

  close(): void {
    if (this.side.closed) {
      return;
    }
    this.side.closed = true;
    this.closeHandler?.();
    this.side.peer?.notifyClosed();
  }

  notifyClosed(): void {
    this.side.closed = true;
    this.closeHandler?.();
  }
}

export function memoryTransports(
  labelA = "a",
  labelB = "b",
): [Transport, Transport] {
  const sideA: MemorySide = { peer: null, inbox: [], closed: false };
  const sideB: MemorySide = { peer: null, inbox: [], closed: false };
  const a = new MemoryTransport(labelA, sideA);
  const b = new MemoryTransport(labelB, sideB);
  sideA.peer = b;
  sideB.peer = a;
  return [a, b];
}

export function flush(rounds = 4): Promise<void> {
  let chain = Promise.resolve();
  for (let i = 0; i < rounds; i += 1) {
    chain = chain.then(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  }
  return chain;
}
