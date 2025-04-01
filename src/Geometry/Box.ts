import { ParameterizedGeometry } from "./ParameterizedGeometry";
import { vec3, vec2 } from "gl-matrix";

import { Mesh } from "./Mesh";
import { Vertex } from "./Vertex";
import { VertexBufferLayout, VertexTypes } from "../Renderer/Buffer";

/**
 * A rectangular cuboid parameterized by a width, depth, and height dimension
 */
class Box extends ParameterizedGeometry {
	private _width: number;
	private _height: number;
	private _depth: number;

	/**
	 * Creates a new box geometry object
	 *
	 * @param dimensions - The size of the box [width, height, depth]
	 */
	constructor(dimensions: vec3) {
		super();
		this._width = dimensions[0];
		this._height = dimensions[1];
		this._depth = dimensions[2];
	}

	/**
	 * Generates a mesh object from the box geometry
	 *
	 * @returns - The mesh object generated from the box dimensions
	 */
	calculateMesh(): Mesh {
		const halfWidth: number = this._width / 2;
		const halfHieght: number = this._height / 2;
		const halfDepth: number = this._depth / 2;

		const vertexBufferLayout = new VertexBufferLayout([
			{
				name: "position",
				size: 3,
				type: VertexTypes.FLOAT,
				normalized: false,
			},
			{
				name: "normal",
				size: 3,
				type: VertexTypes.FLOAT,
				normalized: true,
			},
		]);

		// TODO: add texture coords to vertex list
		const textureCoordList: vec2[] = [
			[1.0, 0.333333],
			[1.0, 0.666667],
			[0.666667, 0.666667],
			[0.666667, 0.333333],
			[0.666667, 0.0],
			[0.0, 0.333333],
			[0.0, 0.0],
			[0.333333, 0.0],
			[0.333333, 1.0],
			[0.0, 1.0],
			[0.0, 0.666667],
			[0.333333, 0.333333],
			[0.333333, 0.666667],
			[1.0, 0.0],
		];

		const vertexList: Vertex[] = [
			// back face
			{
				position: [-halfWidth, halfHieght, -halfDepth],
				normal: [0, 0, -1],
			},
			{
				position: [-halfWidth, -halfHieght, -halfDepth],
				normal: [0, 0, -1],
			},
			{
				position: [halfWidth, -halfHieght, -halfDepth],
				normal: [0, 0, -1],
			},
			{
				position: [halfWidth, halfHieght, -halfDepth],
				normal: [0, 0, -1],
			},

			// top face
			{
				position: [-halfWidth, halfHieght, -halfDepth],
				normal: [0, 1, 0],
			},
			{
				position: [-halfWidth, halfHieght, halfDepth],
				normal: [0, 1, 0],
			},
			{
				position: [halfWidth, halfHieght, halfDepth],
				normal: [0, 1, 0],
			},
			{
				position: [halfWidth, halfHieght, -halfDepth],
				normal: [0, 1, 0],
			},

			// front face
			{
				position: [-halfWidth, halfHieght, halfDepth],
				normal: [0, 0, 1],
			},
			{
				position: [-halfWidth, -halfHieght, halfDepth],
				normal: [0, 0, 1],
			},
			{
				position: [halfWidth, -halfHieght, halfDepth],
				normal: [0, 0, 1],
			},
			{
				position: [halfWidth, halfHieght, halfDepth],
				normal: [0, 0, 1],
			},

			// bottom face
			{
				position: [-halfWidth, -halfHieght, -halfDepth],
				normal: [0, -1, 0],
			},
			{
				position: [-halfWidth, -halfHieght, halfDepth],
				normal: [0, -1, 0],
			},
			{
				position: [halfWidth, -halfHieght, halfDepth],
				normal: [0, -1, 0],
			},
			{
				position: [halfWidth, -halfHieght, -halfDepth],
				normal: [0, -1, 0],
			},

			// right face
			{
				position: [halfWidth, halfHieght, halfDepth],
				normal: [1, 0, 0],
			},
			{
				position: [halfWidth, -halfHieght, halfDepth],
				normal: [1, 0, 0],
			},
			{
				position: [halfWidth, -halfHieght, -halfDepth],
				normal: [1, 0, 0],
			},
			{
				position: [halfWidth, halfHieght, -halfDepth],
				normal: [1, 0, 0],
			},

			// left face
			{
				position: [-halfWidth, halfHieght, -halfDepth],
				normal: [-1, 0, 0],
			},
			{
				position: [-halfWidth, -halfHieght, -halfDepth],
				normal: [-1, 0, 0],
			},
			{
				position: [-halfWidth, -halfHieght, halfDepth],
				normal: [-1, 0, 0],
			},
			{
				position: [-halfWidth, halfHieght, halfDepth],
				normal: [-1, 0, 0],
			},
		];

		const indicesList: number[][] = [
			// back face
			[0, 1, 2],
			[0, 2, 3],

			// top face
			[4, 5, 6],
			[4, 6, 7],

			// front face
			[8, 9, 10],
			[8, 10, 11],

			// bottom face
			[12, 13, 14],
			[12, 14, 15],

			// right face
			[16, 17, 18],
			[16, 18, 19],

			// left face
			[20, 21, 22],
			[20, 22, 23],
		];

		return new Mesh(vertexList, indicesList, vertexBufferLayout);
	}
}

export { Box };
