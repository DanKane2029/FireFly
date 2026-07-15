import { Texture } from "../Renderer/Texture";

/**
 * Decodes encoded image bytes (PNG/JPEG, as glTF's baseColorTexture images
 * are stored) into a `Texture` of raw RGBA8 pixels. Deliberately split out
 * of GLTFLoader.ts: decoding needs a DOM (createImageBitmap + a 2D canvas
 * to read pixels back out), which means - like the Renderer - this can't be
 * unit-tested without a real browser (see CLAUDE.md's "the renderer can't
 * be unit-tested directly" trap). GLTFLoader.ts itself stays DOM-free and
 * testable; only this last step touches the browser.
 */
export async function decodeImage(
	bytes: Uint8Array,
	mimeType: string
): Promise<Texture> {
	const blob = new Blob([bytes], { type: mimeType });
	const bitmap = await createImageBitmap(blob);

	const canvas = document.createElement("canvas");
	canvas.width = bitmap.width;
	canvas.height = bitmap.height;
	const context = canvas.getContext("2d");
	if (!context) {
		throw new Error("Failed to get a 2D canvas context to decode an image.");
	}
	context.drawImage(bitmap, 0, 0);
	bitmap.close();

	const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
	return new Texture(imageData.data, canvas.width, canvas.height);
}
