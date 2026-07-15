import { ParameterizedGeometry } from "./ParameterizedGeometry";
import { vec3 } from "gl-matrix";

import { Mesh } from "./Mesh";
import { Vertex } from "./Vertex";
import { VertexBufferLayout, VertexTypes } from "../Renderer/Buffer";

/**
 * A flat annulus in the local XY plane (default-facing +Z), parameterized by
 * an inner and outer radius. Used for the rotation gizmo's handles (see
 * Renderer/Gizmo.ts) - a ring, oriented so its face is perpendicular to the
 * axis it rotates around.
 *
 * Built double-sided (two full copies of the ring, one facing each way):
 * the gizmo's overlay pass draws with normal backface culling, and the
 * camera can orbit to any angle above or below the ring's plane, so a
 * single-sided ring would vanish for half of all viewing angles.
 */
class Ring extends ParameterizedGeometry {
	private _innerRadius: number;
	private _outerRadius: number;

	/**
	 * @param innerRadius - Radius of the ring's inner edge
	 * @param outerRadius - Radius of the ring's outer edge
	 */
	constructor(innerRadius: number, outerRadius: number) {
		super();
		this._innerRadius = innerRadius;
		this._outerRadius = outerRadius;
	}

	/**
	 * @param detailLevel - Number of radial segments (higher = rounder ring)
	 */
	calculateMesh(detailLevel: number): Mesh {
		const segments = Math.max(3, detailLevel);

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

		const vertexList: Vertex[] = [];
		const indicesList: number[][] = [];

		// `reversed` flips each face's winding to match its opposite normal,
		// so both copies are front-facing (and so lit/visible, not culled)
		// from their own side.
		const faces: { normal: vec3; reversed: boolean }[] = [
			{ normal: [0, 0, 1], reversed: false },
			{ normal: [0, 0, -1], reversed: true },
		];

		for (const { normal, reversed } of faces) {
			for (let i = 0; i < segments; i++) {
				const angle0 = (i / segments) * Math.PI * 2;
				const angle1 = ((i + 1) / segments) * Math.PI * 2;
				const cos0 = Math.cos(angle0);
				const sin0 = Math.sin(angle0);
				const cos1 = Math.cos(angle1);
				const sin1 = Math.sin(angle1);

				const inner0: vec3 = [
					cos0 * this._innerRadius,
					sin0 * this._innerRadius,
					0,
				];
				const outer0: vec3 = [
					cos0 * this._outerRadius,
					sin0 * this._outerRadius,
					0,
				];
				const inner1: vec3 = [
					cos1 * this._innerRadius,
					sin1 * this._innerRadius,
					0,
				];
				const outer1: vec3 = [
					cos1 * this._outerRadius,
					sin1 * this._outerRadius,
					0,
				];

				const base = vertexList.length;
				vertexList.push(
					{ position: inner0, normal, textureCoord: [0, 0] },
					{ position: outer0, normal, textureCoord: [1, 0] },
					{ position: outer1, normal, textureCoord: [1, 1] },
					{ position: inner1, normal, textureCoord: [0, 1] }
				);

				indicesList.push(
					reversed
						? [base, base + 2, base + 1]
						: [base, base + 1, base + 2],
					reversed
						? [base, base + 3, base + 2]
						: [base, base + 2, base + 3]
				);
			}
		}

		return new Mesh(vertexList, indicesList, vertexBufferLayout);
	}
}

export { Ring };
