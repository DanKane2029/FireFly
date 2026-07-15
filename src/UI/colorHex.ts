/** Formats a 0..1 rgb(a) color as a "#rrggbb" hex string for <input type=color>. */
export function toHex(color: ArrayLike<number>): string {
	const channel = (v: number) =>
		Math.round(Math.max(0, Math.min(1, v)) * 255)
			.toString(16)
			.padStart(2, "0");
	return `#${channel(color[0])}${channel(color[1])}${channel(color[2])}`;
}

/** Parses a "#rrggbb" hex string back into 0..1 rgb components. */
export function fromHex(hex: string): [number, number, number] {
	const n = parseInt(hex.slice(1), 16);
	return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
