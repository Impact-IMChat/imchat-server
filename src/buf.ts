export default class BufParser {
  constructor(public buffer: ArrayBuffer) { }

  static read(buffer: ArrayBuffer): BufParser {
    return new BufParser(buffer);
  }

  static write(byteLength: number): BufParser {
    const buffer = new ArrayBuffer(byteLength);
    return new BufParser(buffer);
  }

  writeIndex = 0;
  readIndex = 0;
  toBuffer(): ArrayBuffer {
    return this.buffer.slice(0, this.writeIndex);
  }

  readByte(): number {
    const dataView = new DataView(this.buffer);
    return dataView.getUint8(this.readIndex++);
  }

  readBoolean(): boolean {
    return this.readByte() === 1;
  }

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
    if (newReadIndex > this.buffer.byteLength) {
      throw new Error(
        `String length ${length} exceeds remaining data (${this.buffer.byteLength - this.readIndex} bytes left)`,
      );
    }
    const view = new TextDecoder().decode(this.buffer.slice(this.readIndex, newReadIndex));
    this.readIndex = newReadIndex;
    return view;
  }

  // New methods to write data into the buffer (ArrayBuffer/DataView)
  writeBoolean(value: boolean): void {
    this.ensureCapacity(1);
    const dataView = new DataView(this.buffer);
    dataView.setUint8(this.writeIndex++, value ? 1 : 0);
  }

  // Write string to buffer safely
  writeString(str: string): this {
    const byteLength = BufParser.stringBytes(str);
    this.ensureCapacity(byteLength);
    const utf8Bytes = new TextEncoder().encode(str);
    const length = utf8Bytes.length;

    // Write the VarInt length
    this.writeVarInt(length);
    // Write the actual string bytes
    new Uint8Array(this.buffer).set(utf8Bytes, this.writeIndex);
    this.writeIndex += length;

    return this;
  }

  // Optimized writeVarInt method
  writeVarInt(value: number): this {
    let input = value >>> 0;

    if ((input & 0xFFFFFF80) === 0) {
      this.ensureCapacity(1);
      const dataView = new DataView(this.buffer);
      dataView.setUint8(this.writeIndex++, input);
    } else if ((input & 0xFFFFC000) === 0) {
      this.ensureCapacity(2);
      const w = ((input & 0x7F) | 0x80) << 8 | (input >>> 7);
      const dataView = new DataView(this.buffer);
      dataView.setUint16(this.writeIndex, w, true); // Little-endian
      this.writeIndex += 2;
    } else {
      this.writeVarIntFull(input);
    }
    return this;
  }

  // Helper method to ensure buffer has enough space
  private ensureCapacity(size: number): void {
    if (this.writeIndex + size > this.buffer.byteLength) {
      const newBuffer = new ArrayBuffer(this.buffer.byteLength * 2);
      new Uint8Array(newBuffer).set(new Uint8Array(this.buffer));
      this.buffer = newBuffer;
    }
  }


  private writeVarIntFull(value: number): void {
    if ((value & 0xFFFFFF80) === 0) {
      this.ensureCapacity(1);
      new DataView(this.buffer).setUint8(this.writeIndex++, value);
    } else if ((value & 0xFFFFC000) === 0) {
      this.ensureCapacity(2);
      const w = ((value & 0x7F) | 0x80) << 8 |
        (value >>> 7);
      new DataView(this.buffer).setUint16(this.writeIndex, w, true); // Little-endian
      this.writeIndex += 2;
    } else if ((value & 0xFFE00000) === 0) {
      this.ensureCapacity(3);
      const w = ((value & 0x7F) | 0x80) << 16 |
        (((value >>> 7) & 0x7F) | 0x80) << 8 |
        (value >>> 14);
      new DataView(this.buffer).setUint8(this.writeIndex++, w & 0xFF);
      new DataView(this.buffer).setUint8(this.writeIndex++, (w >>> 8) & 0xFF);
      new DataView(this.buffer).setUint8(this.writeIndex++, (w >>> 16) & 0xFF);
    } else if ((value & 0xF0000000) === 0) {
      this.ensureCapacity(4);
      new DataView(this.buffer).setUint8(this.writeIndex++, (value & 0x7F) | 0x80);
      new DataView(this.buffer).setUint8(this.writeIndex++, ((value >>> 7) & 0x7F) | 0x80);
      new DataView(this.buffer).setUint8(this.writeIndex++, ((value >>> 14) & 0x7F) | 0x80);
      new DataView(this.buffer).setUint8(this.writeIndex++, value >>> 21);
    } else {
      this.ensureCapacity(5);
      new DataView(this.buffer).setUint8(this.writeIndex++, (value & 0x7F) | 0x80);
      new DataView(this.buffer).setUint8(this.writeIndex++, ((value >>> 7) & 0x7F) | 0x80);
      new DataView(this.buffer).setUint8(this.writeIndex++, ((value >>> 14) & 0x7F) | 0x80);
      new DataView(this.buffer).setUint8(this.writeIndex++, ((value >>> 21) & 0x7F) | 0x80);
      new DataView(this.buffer).setUint8(this.writeIndex++, value >>> 28);
    }
  }


  static stringBytes(value: string): number {
    return new TextEncoder().encode(value).length;
  }
}
