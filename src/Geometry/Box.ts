import { ParameterizedGeometry } from "./ParameterizedGeometry";
import { vec3, vec2 } from "gl-matrix";

import { Mesh } from "./Mesh";

class Box extends ParameterizedGeometry {
	private _width: number;
	private _height: number;
	private _depth: number;

	constructor(dimensions: vec3) {
		super();
		this._width = dimensions[0];
		this._height = dimensions[1];
		this._depth = dimensions[2];
	}

	calculateMesh() {
		const halfWidth: number = this._width / 2;
		const halfHieght: number = this._height / 2;
		const halfDepth: number = this._depth / 2;

		const vertexList: vec3[] = [
			[-halfWidth, -halfHieght, -halfDepth],
			[-halfWidth, halfHieght, -halfDepth],
			[halfWidth, halfHieght, -halfDepth],
			[halfWidth, -halfHieght, -halfDepth],
			[-halfWidth, -halfHieght, halfDepth],
			[-halfWidth, halfHieght, halfDepth],
			[halfWidth, halfHieght, halfDepth],
			[halfWidth, -halfHieght, halfDepth],
		];

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

		const normalList: vec3[] = [
			[0.0, -1.0, 0.0],
			[0.0, 1.0, 0.0],
			[1.0, 0.0, 0.0],
			[-0.0, 0.0, 1.0],
			[-1.0, -0.0, -0.0],
			[0.0, 0.0, -1.0],
		];

		const indicesList: number[][] = [
			[2, 1, 1, 3, 2, 1, 4, 3, 1],
			[8, 1, 2, 7, 4, 2, 6, 5, 2],
			[5, 6, 3, 6, 7, 3, 2, 8, 3],
			[6, 8, 4, 7, 5, 4, 3, 4, 4],
			[3, 9, 5, 7, 10, 5, 8, 11, 5],
			[1, 1, 6, 4, 13, 6, 8, 11, 6],
			[1, 4, 1, 2, 1, 1, 4, 3, 1],
			[5, 1, 2, 8, 1, 2, 6, 5, 2],
			[1, 1, 3, 5, 6, 3, 2, 8, 3],
			[2, 1, 4, 6, 8, 4, 3, 4, 4],
			[4, 1, 5, 3, 9, 5, 8, 11, 5],
			[5, 6, 6, 1, 12, 6, 8, 11, 6],
		];

		return new Mesh(vertexList, textureCoordList, normalList, indicesList);
	}
}

export { Box };
