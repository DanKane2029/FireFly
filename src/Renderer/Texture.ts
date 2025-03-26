/**
 * An image or pixel array that can be accessed in shader programs
 */
class Texture {
	private _texture: WebGLTexture;
	private _created: boolean;
	private _loaded: boolean;
	private _name: string;
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
		this._created = false;
		this._loaded = false;
		this._data = data;
		this._width = width;
		this._height = height;
	}

	/**
	 * Gets the WebGLTexture object in the WebGL conetext
	 */
	get texture(): WebGLTexture {
		return this._texture;
	}

	/**
	 * Sets the WebGLTexture object
	 */
	set texture(texture: WebGLTexture) {
		this._texture = texture;
	}

	/**
	 * Gets the created boolean
	 */
	get created(): boolean {
		return this._created;
	}

	/**
	 * Sets the created boolean
	 */
	set created(created: boolean) {
		this._created = created;
	}

	/**
	 * Gets the loaded boolean
	 */
	get loaded(): boolean {
		return this._loaded;
	}

	/**
	 * Sets the loaded boolean
	 */
	set loaded(loaded: boolean) {
		this._loaded = loaded;
	}

	/**
	 * Gets the name of the texture
	 */
	get name(): string {
		return this._name;
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

	/**
	 * Sets the created boolean to false will reload the texture into the GPU
	 */
	resetCreated(): void {
		this._created = false;
	}
}

export { Texture };
