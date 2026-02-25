import BufParser from "../buf";
import ProtocolVersion from "../protocol";

export class BinMsg {
	public constructor(
		public msg: string,
		public author?: string,
		public platformID?: string,
	) {}

	static readInitial(buf: ArrayBuffer): BinMsg {
		const bp = BufParser.read(buf);
		return new BinMsg(
			bp.readString(),
			BinMsg.readOptString(bp),
			BinMsg.readOptString(bp),
		);
	}

	static readOptString(bp: BufParser): string | undefined {
		const present = bp.readBoolean();
		if (!present) return undefined;
		return bp.readString();
	}

	static read(version: ProtocolVersion, buf: ArrayBuffer): BinMsg {
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
		bp.writeBoolean(!!s);
		if (s) {
			bp.writeString(s);
		}
	}

	writeInitial(): ArrayBuffer {
		const bp = BufParser.write(
			BufParser.stringBytes(this.msg) +
				BinMsg.optStringBytes(this.author) +
				BinMsg.optStringBytes(this.platformID),
		);
		bp.writeString(this.msg);
		this.writeOptString(bp, this.author);
		this.writeOptString(bp, this.platformID);
		return bp.toBuffer();
	}
	write(version: ProtocolVersion): ArrayBuffer {
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

// function test(pv: ProtocolVersion) {
// 	const author = undefined;
// 	const message = "67";
// 	const platformID = "impact:test";

// 	console.log(`${author}: ${message} via ${platformID}`);
// 	const from = new BinMsg(message, author, platformID).write(pv);
// 	console.info("Encoded: ", from);
// 	const to = BinMsg.read(pv, from);
// 	if (to.author !== author) {
// 		console.warn(
// 			`Decoded author improperly: ${author} decodes to ${to.author}`,
// 		);
// 	}
// 	if (to.msg !== message) {
// 		console.warn(`Decoded message improperly: ${message} decodes to ${to.msg}`);
// 	}
// 	if (to.platformID !== platformID) {
// 		console.warn(
// 			`Decoded platformID improperly: ${platformID} decodes to ${to.platformID}`,
// 		);
// 	}
// 	console.info("Decoded successfully!");
// }

// test(ProtocolVersion.INITIAL);
