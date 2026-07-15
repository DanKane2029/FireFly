/**
 * A short, content-derived hex prefix for naming an imported asset within a
 * workspace (e.g. "assets/4b7e2a91-chair.glb") - importing the exact same
 * file twice produces the same name, so it dedupes to the same asset
 * instead of piling up duplicate copies. Uses the Web Crypto API (native,
 * no dependency) rather than anything homegrown.
 */
export async function shortContentHash(bytes: Uint8Array): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("")
		.slice(0, 8);
}
