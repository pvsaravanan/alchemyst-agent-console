export interface BufferMessage {
  type: string;
  seq: number;
  [key: string]: any;
}

export class ReorderBuffer {
  private lastProcessedSeq: number = 0;
  private buffer: BufferMessage[] = [];
  private receivedSeqs: Set<number> = new Set();

  constructor(initialSeq: number = 0) {
    this.lastProcessedSeq = initialSeq;
  }

  reset(initialSeq: number = 0): void {
    this.lastProcessedSeq = initialSeq;
    this.buffer = [];
    this.receivedSeqs.clear();
  }

  getLastProcessedSeq(): number {
    return this.lastProcessedSeq;
  }

  getBuffer(): BufferMessage[] {
    return [...this.buffer];
  }

  addMessage(msg: BufferMessage): BufferMessage[] {
    const seq = msg.seq;

    // 1. Deduplication checks
    if (this.receivedSeqs.has(seq)) {
      return [];
    }
    if (seq <= this.lastProcessedSeq) {
      return [];
    }

    // 2. Insert into sorted buffer
    let insertIdx = 0;
    while (insertIdx < this.buffer.length && this.buffer[insertIdx].seq < seq) {
      insertIdx++;
    }

    if (insertIdx === this.buffer.length || this.buffer[insertIdx].seq !== seq) {
      this.buffer.splice(insertIdx, 0, msg);
    }

    // 3. Pull consecutive sorted messages
    const readyMessages: BufferMessage[] = [];
    while (this.buffer.length > 0 && this.buffer[0].seq === this.lastProcessedSeq + 1) {
      const nextMsg = this.buffer.shift()!;
      this.lastProcessedSeq = nextMsg.seq;
      this.receivedSeqs.add(nextMsg.seq);
      readyMessages.push(nextMsg);
    }

    return readyMessages;
  }
}
