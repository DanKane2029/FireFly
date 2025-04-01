import { vec3 } from "gl-matrix";
import { toCatesianCoord } from "../Math/SphericalCoordinates";
import { VertexBufferLayout, VertexTypes } from "../Renderer/Buffer";
import { Mesh } from "./Mesh";
import { ParameterizedGeometry } from "./ParameterizedGeometry";
import { Vertex } from "./Vertex";

/**
 * The set of points equadistant to a single point.
 */
class Sphere implements ParameterizedGeometry {
	private _radius: number;

	/**
	 * Creates a new sphere geometry
	 * 
	 * @param radius - The distance from the set of points to the center
	 */
	constructor(radius: number) {
		this._radius = radius;
	}

	/**
	 * Gets the radius of the sphere
	 */
	get radius(): number {
		return this._radius;
	}

	/**
	 * Sets the radius of the sphere
	 */
	set radius(radius: number) {
		this._radius = radius;
	}

	/**
	 * Generates a mesh object from the sphere
	 * 
	 * @param detailLevel - Dictates the number of vertices to generate on the sphere's surface. 
	 * @returns - The mesh that represents the sphere geometry
	 */
	calculateMesh(detailLevel: number): Mesh {
		const thetas = new Array(detailLevel + 1)
			.fill(0)
			.map((_, i) => (i * Math.PI) / detailLevel);

		const phis = new Array(detailLevel + 1)
			.fill(0)
			.map((_, i) => (i * Math.PI * 2) / detailLevel);

		const spherePoints = thetas.map((t) =>
			phis.map((p) =>
				toCatesianCoord({ radius: this.radius, phi: p, theta: t })
			)
		);

		const indices: number[][] = [];
		spherePoints.slice(0, -1).forEach((row: vec3[], i: number) => {
			row.slice(0, -1).forEach((sp: vec3, j: number) => {
				const topLeftIndex = i * row.length + j;
				const bottomLeftIndex = (i + 1) * row.length + j;
				const bottomRightIndex = (i + 1) * row.length + (j + 1);
				const topRightIndex = i * row.length + j + 1;

				indices.push([topLeftIndex, bottomLeftIndex, bottomRightIndex]);
				indices.push([topLeftIndex, bottomRightIndex, topRightIndex]);
			});
		});

		const vertexList: Vertex[] = spherePoints.flat().map((p: vec3) => {
			const normal = vec3.create();
			vec3.sub(normal, p, vec3.fromValues(0, 0, 0));
			vec3.normalize(normal, normal);
			return {
				position: p,
				normal: normal,
			};
		});

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

		return new Mesh(vertexList, indices, vertexBufferLayout);
	}
}

export { Sphere };
