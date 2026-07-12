/**
 * Holds the per-vertex data for a mesh (positions, normals, etc.) as a single
 * flat Float32Array, ready to upload to the GPU. The data is *interleaved* -
 * one vertex's attributes sit together in memory - and the accompanying
 * VertexBufferLayout describes how to slice each vertex back into attributes.
 * The `created` flag tracks whether the data has been uploaded to a WebGL
 * buffer yet, so the renderer only uploads it once.
 */
class VertexBuffer {
	private _vertices: Float32Array;
	// Assigned by the Renderer when the buffer is uploaded to the GPU.
	private _buffer!: WebGLBuffer;
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
	 * Gets the vertex data from the vertex buffer.
	 */
	get vertices(): Float32Array {
		return this._vertices;
	}

	/**
	 * Sets the vertex data from the vertex buffer.
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
}

/**
 * Holds the face indices for a mesh: triples of indices into the VertexBuffer,
 * each triple describing one triangle. Indexing lets vertices shared by
 * several triangles be stored once instead of repeated per triangle.
 */
class IndexBuffer {
	private _indices: Uint32Array;
	// Assigned by the Renderer when the buffer is uploaded to the GPU.
	private _buffer!: WebGLBuffer;
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
 * Describes how the flat float array in a VertexBuffer is divided into named
 * attributes: for each attribute, its shader name, how many floats it spans,
 * its type, and whether it should be normalized. The renderer uses this to
 * wire the buffer up to the matching shader inputs (see setVertexAttributes).
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
}

export {
	VertexBuffer,
	IndexBuffer,
	VertexBufferLayout,
	VertexLayout,
	VertexTypes,
};
