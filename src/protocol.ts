/**
 * The version.
 */
export enum ProtocolVersion {
	INITIAL, // = 0
}
export function tryParseProtocolVersion(
	v: string,
): ProtocolVersion | undefined {
	const vInt = parseInt(v, 10);
	const isNum = !Number.isNaN(vInt);
	return Object.entries(ProtocolVersion).find(([a, b]) => {
		if (typeof b === "string") return false;
		return a === v || (isNum && b === vInt);
	})?.[1] as ProtocolVersion | undefined;
}
export default ProtocolVersion;
