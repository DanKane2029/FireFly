import { Vertex } from "./Vertex";
import {
	IndexBuffer,
	VertexBuffer,
	VertexBufferLayout,
	VertexLayout,
} from "../Renderer/Buffer";

/**
 * Maps a shader vertex-attribute name to the field it reads from a Vertex.
 * This is what lets the buffer layout drive interleaving: whatever attributes
 * the layout declares (in whatever order) are pulled from the matching Vertex
 * fields.
 */
const ATTRIBUTE_TO_VERTEX_FIELD: Record<string, keyof Vertex> = {
	a_position: "position",
	a_normal: "normal",
	a_texCoord: "textureCoord",
	a_color: "color",
};

/**
 * Describes the geometry of a scene object with a list of vertices and face indices.
 */
class Mesh {
	private _vertexList: Vertex[];
	private _vertexBuffer: VertexBuffer;
	private _indexBuffer: IndexBuffer;
	private _indicesList: number[][];
	private _vertexLayout: VertexBufferLayout;

	/**
	 * Creates a mesh object with list of vertices and index array to desrcibe the geometry of an object.
	 *
	 * @param vertexList - The list of vertices of the mesh containing position, normal, texture coordinates and other data.
	 * @param indicesList - List of lists describing the connectivity of the mesh. Each list in the list conatins integers
	 * 						that are indices into the vertex list and describe 1 face.
	 * @param vertexBufferLayout - The layout that describes the data in each vertex.
	 */
	constructor(
		vertexList: Vertex[],
		indicesList: number[][],
		vertexBufferLayout: VertexBufferLayout
	) {
		this._vertexList = vertexList;
		this._indicesList = indicesList;
		this._vertexLayout = vertexBufferLayout;

		this._vertexBuffer = new VertexBuffer(
			Mesh.interleave(vertexList, vertexBufferLayout),
			this._vertexLayout
		);

		this._indexBuffer = new IndexBuffer(
			new Uint32Array(this._indicesList.flat())
		);
	}

	/**
	 * Packs a list of vertices into a single interleaved Float32Array laid out
	 * exactly as the buffer layout describes. "Interleaved" means one vertex's
	 * attributes sit next to each other in memory (e.g. [px,py,pz, nx,ny,nz]
	 * per vertex) rather than in separate arrays. The layout defines the order
	 * and width of each attribute; this walks it per vertex and copies the
	 * matching Vertex field into place.
	 *
	 * @param vertexList - The vertices to pack
	 * @param layout - Describes which attributes to write and how wide each is
	 * @returns - The interleaved vertex data ready to upload to a VertexBuffer
	 */
	private static interleave(
		vertexList: Vertex[],
		layout: VertexBufferLayout
	): Float32Array {
		const attributes: VertexLayout[] = layout.layout;
		const floatsPerVertex = attributes.reduce(
			(total, attribute) => total + attribute.size,
			0
		);

		const data = new Float32Array(vertexList.length * floatsPerVertex);

		let offset = 0;
		vertexList.forEach((vertex: Vertex) => {
			attributes.forEach((attribute: VertexLayout) => {
				const field = ATTRIBUTE_TO_VERTEX_FIELD[attribute.name];
				const value = field === undefined ? undefined : vertex[field];

				if (value === undefined) {
					throw new Error(
						`Vertex is missing data for attribute "${attribute.name}" ` +
							`required by the buffer layout.`
					);
				}

				for (let i = 0; i < attribute.size; i++) {
					data[offset++] = (value as number[])[i];
				}
			});
		});

		return data;
	}

	/**
	 * Gets the vertex list of the mesh
	 */
	get vertexList() {
		return this._vertexList;
	}

	/**
	 * Sets the vertex list of the mesh
	 */
	set vertexList(vertexList: Vertex[]) {
		this._vertexList = vertexList;
	}

	/**
	 * Gets the indices list of the mesh
	 */
	get indicesList(): number[][] {
		return this._indicesList;
	}

	/**
	 * Sets the indices list of the mesh
	 */
	set indicesList(indicesList: number[][]) {
		this._indicesList = indicesList;
	}

	/**
	 * Gets the vertex data as a Vertex Buffer
	 */
	get vertexBuffer(): VertexBuffer {
		return this._vertexBuffer;
	}

	/**
	 * Gets the indices data as an Index Buffer
	 */
	get indexBuffer(): IndexBuffer {
		return this._indexBuffer;
	}

	/**
	 * Clones the mesh. The clone shares the immutable source data (vertex list,
	 * index list, layout) but rebuilds its own vertex/index buffers, so each
	 * clone tracks and uploads its own independent GPU handles. This is what
	 * lets the snowman reuse one sphere geometry many times cheaply.
	 *
	 * @returns - The cloned mesh object
	 */
	clone(): Mesh {
		return new Mesh(
			this._vertexList,
			this._indicesList,
			this._vertexLayout
		);
	}
}

export { Mesh };
