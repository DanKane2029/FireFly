import { ParameterizedGeometry } from "./ParameterizedGeometry";
import { vec3 } from "gl-matrix";

import { Mesh } from "./Mesh";
import { Vertex } from "./Vertex";
import { VertexBufferLayout, VertexTypes } from "../Renderer/Buffer";

/**
 * A small pyramid (apex at the local origin, a rectangular base a fixed
 * distance out along -Z, this engine's forward convention) - the camera
 * entity's viewport icon (see ecs/prefabs.ts's spawnCamera), immediately
 * recognizable as "a camera" the way every 3D tool draws one, without
 * needing a real optics-accurate frustum. Not parameterized by detailLevel
 * (a pyramid's shape is fully described by its own dimensions, same as
 * Box.ts).
 */
class Frustum extends ParameterizedGeometry {
	private _width: number;
	private _height: number;
	private _depth: number;

	/**
	 * @param dimensions - The base's [width, height] and how far out along
	 * -Z it sits from the apex (depth)
	 */
	constructor(dimensions: vec3) {
		super();
		this._width = dimensions[0];
		this._height = dimensions[1];
		this._depth = dimensions[2];
	}

	calculateMesh(): Mesh {
		const halfWidth = this._width / 2;
		const halfHeight = this._height / 2;
		const depth = this._depth;

		const vertexBufferLayout = new VertexBufferLayout([
			{
				name: "a_position",
				size: 3,
				type: VertexTypes.FLOAT,
				normalized: false,
			},
			{
				name: "a_normal",
				size: 3,
				type: VertexTypes.FLOAT,
				normalized: true,
			},
			{
				name: "a_texCoord",
				size: 2,
				type: VertexTypes.FLOAT,
				normalized: false,
			},
		]);

		const apex: vec3 = [0, 0, 0];
		const topLeft: vec3 = [-halfWidth, halfHeight, -depth];
		const topRight: vec3 = [halfWidth, halfHeight, -depth];
		const bottomRight: vec3 = [halfWidth, -halfHeight, -depth];
		const bottomLeft: vec3 = [-halfWidth, -halfHeight, -depth];

		const vertexList: Vertex[] = [];
		const indicesList: number[][] = [];

		// Four triangular side faces, apex to each base edge - each gets its
		// own flat normal (duplicated vertices, same reasoning as Box.ts:
		// a shared corner can't carry more than one normal).
		const sides: [vec3, vec3][] = [
			[topLeft, topRight],
			[topRight, bottomRight],
			[bottomRight, bottomLeft],
			[bottomLeft, topLeft],
		];
		for (const [a, b] of sides) {
			const edge1 = vec3.subtract(vec3.create(), a, apex);
			const edge2 = vec3.subtract(vec3.create(), b, apex);
			const normal = vec3.normalize(
				vec3.create(),
				vec3.cross(vec3.create(), edge1, edge2)
			);

			const base = vertexList.length;
			vertexList.push(
				{ position: apex, normal, textureCoord: [0.5, 0] },
				{ position: a, normal, textureCoord: [0, 1] },
				{ position: b, normal, textureCoord: [1, 1] }
			);
			indicesList.push([base, base + 1, base + 2]);
		}

		// The base quad, facing -Z (outward, away from the apex).
		const baseNormal: vec3 = [0, 0, -1];
		const base = vertexList.length;
		vertexList.push(
			{ position: topLeft, normal: baseNormal, textureCoord: [0, 0] },
			{ position: bottomLeft, normal: baseNormal, textureCoord: [0, 1] },
			{ position: bottomRight, normal: baseNormal, textureCoord: [1, 1] },
			{ position: topRight, normal: baseNormal, textureCoord: [1, 0] }
		);
		indicesList.push(
			[base, base + 1, base + 2],
			[base, base + 2, base + 3]
		);

		return new Mesh(vertexList, indicesList, vertexBufferLayout);
	}
}

export { Frustum };
