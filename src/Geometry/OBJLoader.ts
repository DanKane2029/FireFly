import { vec3 } from "gl-matrix";
import { VertexBufferLayout, VertexTypes } from "../Renderer/Buffer";
import { Mesh } from "./Mesh";
import { Vertex } from "./Vertex";

/**
 * Loads triangle meshes from Wavefront OBJ text.
 *
 * OBJ is the simplest widely-used 3D model format: a plain-text list of vertex
 * positions (`v x y z`) and faces (`f ...`) that index into them. It's how the
 * classic Stanford models (the bunny and dragon) are shipped here. This loader
 * does the three things needed to turn that raw list into something the renderer
 * can draw and light:
 *
 *   1. Parse positions and triangulate the faces.
 *   2. Compute smooth per-vertex normals when the file has none (the Stanford
 *      scans store positions only) - lighting needs a normal at every vertex.
 *   3. Center and uniformly scale the mesh into a unit box so any model, whatever
 *      its original units, frames sensibly under the app's default camera.
 *
 * The result mirrors what `Sphere.calculateMesh` produces: a Mesh whose vertices
 * carry `a_position` + `a_normal`, ready for the Lighting shaders.
 */

// A single face corner references a position and (optionally) a stored normal.
// OBJ writes corners as `v`, `v/vt`, `v//vn`, or `v/vt/vn`; indices are 1-based
// and may be negative (counting backwards from the most recent element).
interface Corner {
	position: number;
	normal: number | null;
}

/**
 * Parses Wavefront OBJ text into a Mesh with positions and smooth normals.
 *
 * @param text - The full contents of an .obj file.
 * @returns - A Mesh centered on the origin and scaled to fit a unit box.
 */
function parseOBJ(text: string): Mesh {
	const positions: vec3[] = [];
	const fileNormals: vec3[] = [];
	// Each triangle is a triple of corners (post-triangulation).
	const triangleCorners: [Corner, Corner, Corner][] = [];

	const lines = text.split("\n");
	for (const line of lines) {
		// Comments start with '#'; trim and skip blanks.
		const trimmed = line.trim();
		if (trimmed.length === 0 || trimmed.startsWith("#")) {
			continue;
		}

		const parts = trimmed.split(/\s+/);
		const keyword = parts[0];

		if (keyword === "v") {
			positions.push(
				vec3.fromValues(
					parseFloat(parts[1]),
					parseFloat(parts[2]),
					parseFloat(parts[3])
				)
			);
		} else if (keyword === "vn") {
			fileNormals.push(
				vec3.fromValues(
					parseFloat(parts[1]),
					parseFloat(parts[2]),
					parseFloat(parts[3])
				)
			);
		} else if (keyword === "f") {
			const corners = parts
				.slice(1)
				.map((token) =>
					parseCorner(token, positions.length, fileNormals.length)
				);

			// Fan-triangulate: a face with corners c0..cn becomes the triangles
			// (c0,c1,c2), (c0,c2,c3), ... Most OBJ faces are already triangles,
			// so this is usually a single triangle, but it keeps arbitrary
			// convex polygons working.
			for (let i = 1; i < corners.length - 1; i++) {
				triangleCorners.push([corners[0], corners[i], corners[i + 1]]);
			}
		}
		// vt (texture coords) and everything else are ignored: the Lighting
		// shaders only need position + normal.
	}

	const haveFileNormals = fileNormals.length > 0;

	// Build the deduplicated vertex list. Two face corners that reference the
	// same position (and same stored normal, if any) should share one vertex so
	// that the index buffer stays small and, crucially, so that computed normals
	// average across all faces meeting at that position (giving a smooth surface).
	const vertexList: Vertex[] = [];
	const vertexIndexByKey = new Map<string, number>();
	const triangles: number[][] = [];

	const cornerVertexIndex = (corner: Corner): number => {
		const key = `${corner.position}|${corner.normal ?? ""}`;
		const existing = vertexIndexByKey.get(key);
		if (existing !== undefined) {
			return existing;
		}

		const vertex: Vertex = {
			position: positions[corner.position],
			// A real normal is filled in below - either copied from the file or
			// accumulated (starting from zero) across the surrounding faces.
			normal: haveFileNormals
				? vec3.clone(fileNormals[corner.normal as number])
				: vec3.fromValues(0, 0, 0),
		};
		const index = vertexList.length;
		vertexList.push(vertex);
		vertexIndexByKey.set(key, index);
		return index;
	};

	for (const [a, b, c] of triangleCorners) {
		triangles.push([
			cornerVertexIndex(a),
			cornerVertexIndex(b),
			cornerVertexIndex(c),
		]);
	}

	if (!haveFileNormals) {
		computeSmoothNormals(vertexList, triangles);
	}

	normalizeToUnitBox(vertexList);

	const layout = new VertexBufferLayout([
		{ name: "a_position", size: 3, type: VertexTypes.FLOAT, normalized: false },
		{ name: "a_normal", size: 3, type: VertexTypes.FLOAT, normalized: true },
	]);

	return new Mesh(vertexList, triangles, layout);
}

/**
 * Resolves one OBJ face-corner token (e.g. "12", "12/4", "12//7", "12/4/7")
 * into 0-based position / normal indices. OBJ indices are 1-based; a negative
 * index counts backwards from the current end of that element list.
 */
function parseCorner(
	token: string,
	positionCount: number,
	normalCount: number
): Corner {
	const [posToken, , normToken] = token.split("/");

	const resolve = (value: string, count: number): number => {
		const n = parseInt(value, 10);
		// Negative indices are relative to the end; positive are 1-based.
		return n < 0 ? count + n : n - 1;
	};

	return {
		position: resolve(posToken, positionCount),
		normal:
			normToken !== undefined && normToken.length > 0
				? resolve(normToken, normalCount)
				: null,
	};
}

/**
 * Fills in a smooth normal at every vertex by averaging the geometric normals of
 * the triangles that touch it.
 *
 * The normal of a triangle is the cross product of two of its edges. That cross
 * product's length is proportional to the triangle's area, so adding the raw
 * (un-normalized) cross product onto each of the triangle's vertices naturally
 * weights larger faces more heavily - a good approximation of the true surface
 * normal. After every triangle has contributed, each vertex normal is normalized
 * back to unit length.
 */
function computeSmoothNormals(vertexList: Vertex[], triangles: number[][]): void {
	const edge1 = vec3.create();
	const edge2 = vec3.create();
	const faceNormal = vec3.create();

	for (const [ia, ib, ic] of triangles) {
		const a = vertexList[ia].position;
		const b = vertexList[ib].position;
		const c = vertexList[ic].position;

		vec3.subtract(edge1, b, a);
		vec3.subtract(edge2, c, a);
		vec3.cross(faceNormal, edge1, edge2);

		for (const i of [ia, ib, ic]) {
			const n = vertexList[i].normal as vec3;
			vec3.add(n, n, faceNormal);
		}
	}

	for (const vertex of vertexList) {
		const n = vertex.normal as vec3;
		// vec3.normalize leaves a zero-length normal as zero, which is harmless.
		vec3.normalize(n, n);
	}
}

/**
 * Recenters a mesh on the origin and uniformly scales it so its longest axis
 * spans 1 unit (coordinates end up within roughly [-0.5, 0.5]). This makes
 * arbitrary models - which come in wildly different units and positions - frame
 * consistently under the app's default camera at z = 2. Uniform scaling and
 * translation don't change normal directions, so normals are left untouched.
 */
function normalizeToUnitBox(vertexList: Vertex[]): void {
	if (vertexList.length === 0) {
		return;
	}

	const min = vec3.fromValues(Infinity, Infinity, Infinity);
	const max = vec3.fromValues(-Infinity, -Infinity, -Infinity);
	for (const vertex of vertexList) {
		vec3.min(min, min, vertex.position);
		vec3.max(max, max, vertex.position);
	}

	const center = vec3.create();
	vec3.add(center, min, max);
	vec3.scale(center, center, 0.5);

	const longestAxis = Math.max(
		max[0] - min[0],
		max[1] - min[1],
		max[2] - min[2]
	);
	const scale = longestAxis > 0 ? 1 / longestAxis : 1;

	for (const vertex of vertexList) {
		const p = vertex.position;
		vec3.subtract(p, p, center);
		vec3.scale(p, p, scale);
	}
}

export { parseOBJ };
