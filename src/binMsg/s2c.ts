import BufParser from "../buf";
import ProtocolVersion from "../protocol";

export class BinMsg {
    public constructor(public msg: string, public author?: string) {}
    /**
     * Reads a binary message written in the {@link ProtocolVersion.INITIAL} version.
     * @param buf the buffer to read
     * @returns parsed binary message
     */
    static readInitial(buf: Buffer): BinMsg {
        const bp = BufParser.read(buf);
        return new BinMsg(bp.readString(), this.readOptString(bp));
    }
    static writeOptString(bp: BufParser, author?: string) {
        bp.writeBoolean(!!author); // why lol
        if (author) bp.writeString(author);
    }
    static readOptString(bp: BufParser): string | undefined {
        const present = bp.readBoolean();
        if (!present) return undefined;
        return bp.readString();
    }
    /**
     * Decodes / reads a buffer into a binary message parser
     * @param version the version that this buffer was written in
     * @param buf the buffer to read / decode
     * @returns the parsed binary message
     */
    static read(version: ProtocolVersion, buf: Buffer): BinMsg {
        switch (version) {
            case ProtocolVersion.INITIAL:
                return BinMsg.readInitial(buf);
            default:
                throw `Unsupported [R] binary format version: ${version} (${
                    ProtocolVersion[version] ?? "doesn't even exist"
                })`;
        }
    }
    static optStringBytes(a?: string) {
        const booleanSize = 1;
        if (a) {
            return booleanSize + BufParser.stringBytes(a); // present
        }
        return booleanSize;
    }
    private writeOptString(bp: BufParser, s?: string) {
        bp.writeBoolean(!!s)
        if (s) {
            bp.writeString(s);
        }
    }
    writeInitial(): Buffer {
        const bp = BufParser.write(
            BufParser.stringBytes(this.msg) +
                BinMsg.optStringBytes(this.author),
        );
        bp.writeString(this.msg);
        this.writeOptString(bp, this.author);
        return bp.toBuffer();
    }
    write(version: ProtocolVersion): Buffer {
        switch (version) {
            case ProtocolVersion.INITIAL:
                return this.writeInitial();
            default:
                throw `Unsupported [W] binary format version: ${version} (${
                    ProtocolVersion[version] ?? "doesn't even exist"
                })`;
        }
    }
}
