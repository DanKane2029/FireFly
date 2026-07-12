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
		// Latitude rings from the north pole (theta = 0) to the south pole
		// (theta = pi): detailLevel + 1 rings for detailLevel bands.
		const thetas = new Array(detailLevel + 1)
			.fill(0)
			.map((_, i) => (i * Math.PI) / detailLevel);

		// Longitude columns spanning [0, 2*pi). We generate exactly detailLevel
		// columns and deliberately stop short of 2*pi: phi = 0 and phi = 2*pi
		// are the same meridian, so including both would duplicate the seam
		// column and produce degenerate quads there. The seam is closed in the
		// index loop below by wrapping the neighbour column modulo detailLevel.
		const phis = new Array(detailLevel)
			.fill(0)
			.map((_, i) => (i * Math.PI * 2) / detailLevel);

		const spherePoints = thetas.map((t) =>
			phis.map((p) =>
				toCatesianCoord({ radius: this.radius, phi: p, theta: t })
			)
		);

		const columns = phis.length;
		const indices: number[][] = [];
		for (let i = 0; i < thetas.length - 1; i++) {
			for (let j = 0; j < columns; j++) {
				// Wrap the right-hand column so the last quad in each ring
				// stitches back to the first, closing the seam.
				const jNext = (j + 1) % columns;
				const topLeft = i * columns + j;
				const bottomLeft = (i + 1) * columns + j;
				const bottomRight = (i + 1) * columns + jNext;
				const topRight = i * columns + jNext;

				indices.push([topLeft, bottomLeft, bottomRight]);
				indices.push([topLeft, bottomRight, topRight]);
			}
		}

		const vertexList: Vertex[] = spherePoints.flat().map((p: vec3) => {
			// For a sphere centred at the origin, the outward surface normal at
			// a point is simply that point's position normalized.
			const normal = vec3.create();
			vec3.normalize(normal, p);
			return {
				position: p,
				normal: normal,
			};
		});

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
		]);

		return new Mesh(vertexList, indices, vertexBufferLayout);
	}
}

export { Sphere };
