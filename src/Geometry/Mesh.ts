import { Vertex } from "./Vertex";
import {
	IndexBuffer,
	VertexBuffer,
	VertexBufferLayout,
} from "../Renderer/Buffer";

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

		let vertexBufferDataList: number[] = [];
		this.vertexList.forEach((vertex: Vertex) => {
			if (vertex.position) {
				vertexBufferDataList = vertexBufferDataList.concat([
					vertex.position[0],
					vertex.position[1],
					vertex.position[2],
				]);
			}
			if (vertex.normal) {
				vertexBufferDataList = vertexBufferDataList.concat(
					vertex.normal[0],
					vertex.normal[1],
					vertex.normal[2]
				);
			}
		});

		this._vertexBuffer = new VertexBuffer(
			new Float32Array(vertexBufferDataList),
			this._vertexLayout
		);

		this._indexBuffer = new IndexBuffer(
			new Uint32Array(this._indicesList.flat())
		);
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
	 * Clones the mesh
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
