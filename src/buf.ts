export default class BufParser {
  private writeIndex: number = 0;
  private readIndex: number = 0;

  private constructor(private buffer: Buffer) {}

  /** Returns a BufParser for writing a buffer. */
  static write(initialCapacity: number = 256): BufParser {
    return new BufParser(Buffer.allocUnsafe(initialCapacity));
  }

  /** Returns a BufParser for reading a buffer. */
  static read(b: Buffer): BufParser {
    const parser = new BufParser(b);
    parser.writeIndex = b.length;
    return parser;
  }

  /**
   * Returns how many bytes a VarInt will occupy when written.
   * Works for any signed 32-bit integer (including negative).
   */
  static varIntLength(value: number): number {
    let v = value >>> 0;

    if ((v & 0xFFFFFF80) === 0) return 1;
    if ((v & 0xFFFFC000) === 0) return 2;
    if ((v & 0xFFE00000) === 0) return 3;
    if ((v & 0xF0000000) === 0) return 4;
    return 5;
  }

  /**
   * Returns total bytes needed for a string: VarInt(length) + UTF-8 data
   */
  static stringBytes(str: string): number {
    const utf8Bytes = Buffer.byteLength(str, "utf8");
    return BufParser.varIntLength(utf8Bytes) + utf8Bytes;
  }

  writeVarInt(input: number): this {
    // https://github.com/MarkGG8181/stripped-1.8.9/blob/main/src/main/java/net/minecraft/network/PacketBuffer.java#L229-242
    let value = input >>> 0;

    if ((value & 0xFFFFFF80) === 0) {
      this.ensureCapacity(1);
      this.buffer[this.writeIndex++] = value;
    } else if ((value & 0xFFFFC000) === 0) {
      this.ensureCapacity(2);
      const w = ((value & 0x7F) | 0x80) << 8 | (value >>> 7);
      this.buffer.writeUInt16LE(w, this.writeIndex);
      this.writeIndex += 2;
    } else {
      this.writeVarIntFull(value);
    }
    return this;
  }


  public writeByte(v: number) {
    this.buffer[this.writeIndex++] = v;
  }

  public writeBoolean(v: boolean) {
    this.writeByte(v ? 1 : 0);
  }

  private writeVarIntFull(value: number): void {
    // https://steinborn.me/posts/performance/how-fast-can-you-write-a-varint/
    if ((value & 0xFFFFFF80) === 0) {
      this.ensureCapacity(1);
      this.buffer[this.writeIndex++] = value;
    } else if ((value & 0xFFFFC000) === 0) {
      this.ensureCapacity(2);
      const w = ((value & 0x7F) | 0x80) << 8 | (value >>> 7);
      this.buffer.writeUInt16LE(w, this.writeIndex);
      this.writeIndex += 2;
    } else if ((value & 0xFFE00000) === 0) {
      this.ensureCapacity(3);
      const w = ((value & 0x7F) | 0x80) << 16 |
        (((value >>> 7) & 0x7F) | 0x80) << 8 |
        (value >>> 14);
      this.buffer[this.writeIndex++] = w & 0xFF;
      this.buffer[this.writeIndex++] = (w >>> 8) & 0xFF;
      this.buffer[this.writeIndex++] = (w >>> 16) & 0xFF;
    } else if ((value & 0xF0000000) === 0) {
      this.ensureCapacity(4);
      this.buffer[this.writeIndex++] = (value & 0x7F) | 0x80;
      this.buffer[this.writeIndex++] = ((value >>> 7) & 0x7F) | 0x80;
      this.buffer[this.writeIndex++] = ((value >>> 14) & 0x7F) | 0x80;
      this.buffer[this.writeIndex++] = value >>> 21;
    } else {
      this.ensureCapacity(5);
      this.buffer[this.writeIndex++] = (value & 0x7F) | 0x80;
      this.buffer[this.writeIndex++] = ((value >>> 7) & 0x7F) | 0x80;
      this.buffer[this.writeIndex++] = ((value >>> 14) & 0x7F) | 0x80;
      this.buffer[this.writeIndex++] = ((value >>> 21) & 0x7F) | 0x80;
      this.buffer[this.writeIndex++] = value >>> 28;
    }
  }

  private ensureCapacity(additional: number): void {
    if (this.writeIndex + additional > this.buffer.length) {
      const newSize = Math.max(
        this.buffer.length * 2,
        this.writeIndex + additional,
      );
      const newBuffer = Buffer.allocUnsafe(newSize);
      this.buffer.copy(newBuffer, 0, 0, this.writeIndex);
      this.buffer = newBuffer;
    }
  }

  writeString(s: string): this {
    const encoded = new TextEncoder().encode(s);
    const byteLength = encoded.length;

    if (byteLength > 32767) {
      throw new Error(
        `String too big (was ${byteLength} bytes encoded, max 32767)`,
      );
    }

    this.writeVarInt(byteLength);
    this.ensureCapacity(byteLength);

    this.buffer.set(encoded, this.writeIndex);

    this.writeIndex += byteLength;
    return this;
  }

  /**
   * Reads a single unsigned byte from the buffer
   */
  readByte(): number {
    if (this.readIndex >= this.writeIndex) {
      throw new Error("Attempt to read past end of message");
    }
    return this.buffer[this.readIndex++] & 0xFF;
  }
  /** Reads a single byte from the buffer and returns if the byte is `1` */
  readBoolean(): boolean {
    return this.readByte() === 1;
  }

  /**
   * Reads a VarInt from the buffer
   * Returns signed 32-bit integer (matches Java behavior)
   */
  readVarInt(): number {
    let i = 0;
    let j = 0;

    while (true) {
      const b0 = this.readByte();
      i |= (b0 & 0x7F) << (j * 7);

      if (j > 5) {
        throw new Error("VarInt too big");
      }

      if ((b0 & 0x80) !== 0x80) {
        break;
      }
      j++;
    }

    return i;
  }

  readString(): string {
    const length = this.readVarInt();

    const newReadIndex = this.readIndex + length;
    if (newReadIndex > this.writeIndex) {
      throw new Error(
        `String length ${length} exceeds remaining data (${
          this.writeIndex - this.readIndex
        } bytes left)`,
      );
    }

    const view = this.buffer.subarray(this.readIndex, newReadIndex);
    this.readIndex = newReadIndex;

    return new TextDecoder().decode(view);
  }

  /** Returns written data as Buffer */
  toBuffer(): Buffer {
    return this.buffer.subarray(0, this.writeIndex);
  }

  clear(): void {
    this.writeIndex = 0;
    this.readIndex = 0;
  }

  get readableLength(): number {
    return this.writeIndex - this.readIndex;
  }

  get length(): number {
    return this.writeIndex;
  }
}
