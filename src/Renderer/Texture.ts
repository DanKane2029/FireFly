/**
 * An image or pixel array that can be sampled in shader programs.
 *
 * CPU-side data only: the uploaded GPU texture lives in the backend's resource
 * cache keyed by this object (see webgl/GLResourceCache.ts), not in a handle
 * field here, so one Texture can be uploaded by more than one backend.
 */
class Texture {
	private _data: Uint8ClampedArray;
	private _width: number;
	private _height: number;

	/**
	 * Creates a new texture object
	 *
	 * @param data - The array that defines the texture image
	 * @param width - The width of the image or number of columns in the data array
	 * @param height - The height of the image or number of rows in the data array
	 */
	constructor(data: Uint8ClampedArray, width: number, height: number) {
		this._data = data;
		this._width = width;
		this._height = height;
	}

	/**
	 * Get the data array of the texture
	 */
	get data(): Uint8ClampedArray {
		return this._data;
	}

	/**
	 * Gets the width of the texture
	 */
	get width(): number {
		return this._width;
	}

	/**
	 * Gets the height of the texture
	 */
	get height(): number {
		return this._height;
	}
}

export { Texture };
