/**
 * A Buffer that holds vertex data (position, color, normal vector, ect.) that is accessable to the renderer.
 */
class VertexBuffer {
	private _vertices: Float32Array;
	private _buffer: WebGLBuffer;
	private _layout: VertexBufferLayout;
	private _created: boolean;

	/**
	 * Creates a Vertex Buffer
	 *
	 * @param vertices - The data being held in the buffer.
	 * @param layout - An object that describes the different kinds of data and their locations in the buffer.
	 */
	constructor(vertices: Float32Array, layout: VertexBufferLayout) {
		this._vertices = vertices;
		this._layout = layout;
		this._created = false;
	}

	/**
	 * Gets the vertiex data from the vertex buffer.
	 */
	get vertices(): Float32Array {
		return this._vertices;
	}

	/**
	 * Sets the vertiex data from the vertex buffer.
	 */
	set vertices(vertices: Float32Array) {
		this._vertices = vertices;
	}

	/**
	 * Gets the WebGL Buffer
	 */
	get buffer(): WebGLBuffer {
		return this._buffer;
	}

	/**
	 * Sets the WebGL Buffer
	 */
	set buffer(buffer: WebGLBuffer) {
		this._buffer = buffer;
	}

	/**
	 * Gets the buffer layout that describes this vertex buffer's layout
	 */
	get layout(): VertexBufferLayout {
		return this._layout;
	}

	/**
	 * Sets the buffer layout that describes this vertex buffer
	 */
	set layout(layout: VertexBufferLayout) {
		this._layout = layout;
	}

	/**
	 * Returns true if the buffer has been created already in the WebGL context
	 */
	get created(): boolean {
		return this._created;
	}

	/**
	 * Sets the created value
	 */
	set created(created: boolean) {
		this._created = created;
	}

	/**
	 * Creates a clone of the vertex buffer object
	 *
	 * @returns - The cloned vertex buffer object
	 */
	clone(): VertexBuffer {
		const clonedVertexLayout: VertexBufferLayout = this.layout.clone();
		const clonedVertexBuffer = new VertexBuffer(
			this.vertices,
			clonedVertexLayout
		);
		return clonedVertexBuffer;
	}
}

/**
 * A buffer that holds index information about a vertex buffer used to describe the faces of a geometry
 */
class IndexBuffer {
	private _indices: Uint32Array;
	private _buffer: WebGLBuffer;
	private _length: number;
	private _created: boolean;

	/**
	 * Creates an index buffer object
	 *
	 * @param indices - The data being held in the buffer.
	 */
	constructor(indices: Uint32Array) {
		this._indices = indices;
		this._length = indices.length;
		this._created = false;
	}

	/**
	 * Gets the index data from the buffer
	 */
	get indices(): Uint32Array {
		return this._indices;
	}

	/**
	 * Sets the index data from the buffer
	 */
	set indices(vertices: Uint32Array) {
		this._indices = vertices;
		this._length = vertices.length;
	}

	/**
	 * Gets the WebGL Buffer
	 */
	get buffer(): WebGLBuffer {
		return this._buffer;
	}

	/**
	 * Sets the WebGL Buffer
	 */
	set buffer(buffer: WebGLBuffer) {
		this._buffer = buffer;
	}

	/**
	 * Gets the number of indices in the buffer
	 */
	get length(): number {
		return this._length;
	}

	/**
	 * Returns true if the buffer has been created already in the WebGL context
	 */
	get created(): boolean {
		return this._created;
	}

	/**
	 * Sets the created value
	 */
	set created(created: boolean) {
		this._created = created;
	}

	/**
	 * Creates a clone of the index buffer object
	 *
	 * @returns - The cloned index buffer object
	 */
	clone(): IndexBuffer {
		const clonedIndexBuffer = new IndexBuffer(this.indices);
		return clonedIndexBuffer;
	}
}

/**
 * The types allowed in a VertexBuffer
 */
enum VertexTypes {
	FLOAT,
}

/**
 * Describes a singular type of data in a vertex buffer layout
 */
interface VertexLayout {
	name: string;
	size: number;
	type: VertexTypes;
	normalized: boolean;
}

/**
 * Describes what kind of data is in a vertex buffer object
 */
class VertexBufferLayout {
	private _layout: VertexLayout[];
	private _created: boolean;

	/**
	 * Creates a vertex buffer layout
	 *
	 * @param layout - A list of vertex buffer layouts that describe the kind of data in a vertex buffer
	 */
	constructor(layout: VertexLayout[]) {
		this._layout = layout;
		this._created = false;
	}

	/**
	 * Gets the layout of this buffer
	 */
	get layout(): VertexLayout[] {
		return this._layout;
	}

	/**
	 * Returns true if the buffer has been created already in the WebGL context
	 */
	get created(): boolean {
		return this._created;
	}

	/**
	 * Sets the created value
	 */
	set created(created: boolean) {
		this._created = created;
	}

	/**
	 * Creates a clone of the vertex buffer layout object
	 *
	 * @returns - The cloned vertex buffer layout object
	 */
	clone(): VertexBufferLayout {
		const clonedVertexBufferLayout: VertexBufferLayout =
			new VertexBufferLayout(this.layout);
		return clonedVertexBufferLayout;
	}
}

export {
	VertexBuffer,
	IndexBuffer,
	VertexBufferLayout,
	VertexLayout,
	VertexTypes,
};
