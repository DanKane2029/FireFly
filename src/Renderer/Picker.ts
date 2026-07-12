import { vec2 } from "gl-matrix";

/**
 * Resolves a click to the object drawn under it using GPU picking.
 *
 * Every frame the scene is rendered twice into one framebuffer via multiple
 * render targets: the visible color image goes to one attachment, and each
 * object's integer id is written to a second R16I "id-texture" attachment.
 * Picking an object is then just reading back the single id-texture pixel under
 * the cursor - no ray-casting or CPU-side geometry math required. The read
 * samples the last frame that was drawn, so it never triggers a re-render.
 *
 * The id-texture is cleared to -1, which the Picker reports as "nothing"
 * (the background).
 */
class Picker {
	private _gl: WebGL2RenderingContext;
	private _frameBuffer: WebGLFramebuffer;
	private _size: vec2;

	/**
	 * Creates a new Picker.
	 *
	 * @param gl - The WebGL2 context the scene is rendered with
	 * @param frameBuffer - The framebuffer whose COLOR_ATTACHMENT1 holds ids
	 * @param size - The pixel size of the id-texture
	 */
	constructor(
		gl: WebGL2RenderingContext,
		frameBuffer: WebGLFramebuffer,
		size: vec2
	) {
		this._gl = gl;
		this._frameBuffer = frameBuffer;
		this._size = size;
	}

	/**
	 * Reads the object id drawn at a pixel in id-texture space (origin at the
	 * top-left, matching the DOM). Returns the object's id, or null when the
	 * click lands on the background or the id could not be read.
	 *
	 * @param x - X coordinate in id-texture pixels, from the left
	 * @param y - Y coordinate in id-texture pixels, from the top
	 * @returns - The picked object id, or null for background / on failure
	 */
	pick(x: number, y: number): number | null {
		const gl = this._gl;

		// WebGL's framebuffer origin is the bottom-left, but DOM coordinates
		// start at the top-left, so flip Y before reading.
		const pixelX = Math.floor(x);
		const pixelY = Math.floor(this._size[1] - 1 - y);

		if (
			pixelX < 0 ||
			pixelY < 0 ||
			pixelX >= this._size[0] ||
			pixelY >= this._size[1]
		) {
			return null;
		}

		gl.bindFramebuffer(gl.FRAMEBUFFER, this._frameBuffer);
		gl.readBuffer(gl.COLOR_ATTACHMENT1);

		// The read format/type must match the R16I id-texture. Query what the
		// implementation actually supports so we can fail gracefully on
		// platforms that can't read an integer render target.
		const format = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_FORMAT);
		const type = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE);

		let id: number | null = null;
		if (format === gl.RED_INTEGER) {
			const data =
				type === gl.INT ? new Int32Array(1) : new Int16Array(1);
			gl.readPixels(pixelX, pixelY, 1, 1, format, type, data);

			if (gl.getError() === gl.NO_ERROR) {
				// -1 is the clear value: nothing was drawn here.
				id = data[0] < 0 ? null : data[0];
			} else {
				console.warn("GPU picking: failed to read the id-texture.");
			}
		} else {
			console.warn(
				"GPU picking unsupported: this platform cannot read the " +
					"integer id-texture."
			);
		}

		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		return id;
	}
}

export { Picker };
