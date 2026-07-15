import { mat4, vec3, vec4 } from "gl-matrix";

/**
 * The ray-casting math the gizmo's drag interaction needs: turning a clicked
 * screen point into a world-space ray, and finding where that ray comes
 * closest to an axis line (the actual "how far did the mouse drag the
 * handle" measurement). Kept independent of Camera/App/Controller
 * specifically so it stays unit-testable - GizmoController.ts is, like every
 * other Controller, untestable under Jest (they all transitively import
 * App.ts, which pulls in webpack-only .glsl/.obj imports), so this is where
 * the actual math gets verified instead.
 */

export interface Ray {
	origin: vec3;
	/** Normalized. */
	direction: vec3;
}

/**
 * Unprojects a point in normalized device coordinates (x and y each in
 * [-1, 1], the standard GL convention - not pixel coordinates) into a
 * world-space ray from the camera through that point on the screen.
 *
 * @param perspectiveMatrix - The camera's projection matrix
 * @param viewMatrix - The camera's view matrix
 * @param ndcX - Horizontal position, -1 (left edge) to 1 (right edge)
 * @param ndcY - Vertical position, -1 (bottom edge) to 1 (top edge)
 */
export function screenPointToWorldRay(
	perspectiveMatrix: mat4,
	viewMatrix: mat4,
	ndcX: number,
	ndcY: number
): Ray {
	const viewProjection = mat4.multiply(
		mat4.create(),
		perspectiveMatrix,
		viewMatrix
	);
	const inverse = mat4.invert(mat4.create(), viewProjection);
	if (!inverse) {
		throw new Error(
			"Could not invert the view-projection matrix (it's singular)."
		);
	}

	const unproject = (ndcZ: number): vec3 => {
		const clip = vec4.fromValues(ndcX, ndcY, ndcZ, 1);
		const world = vec4.transformMat4(vec4.create(), clip, inverse);
		// Perspective divide: transformMat4 doesn't do this for you.
		return vec3.fromValues(
			world[0] / world[3],
			world[1] / world[3],
			world[2] / world[3]
		);
	};

	const near = unproject(-1);
	const far = unproject(1);
	const direction = vec3.normalize(
		vec3.create(),
		vec3.subtract(vec3.create(), far, near)
	);

	return { origin: near, direction };
}

/**
 * Finds the point on an infinite line (through `lineOrigin`, direction
 * `lineDirection`) that comes closest to `ray` - the standard "closest point
 * between two skew lines in 3D" construction. This is what turns "the mouse
 * moved to this screen position" into "the handle should move this far along
 * its axis": the ray from the camera through the cursor essentially never
 * exactly intersects the axis line, so "closest point" is the well-defined
 * stand-in for "where the cursor is pointing on the axis".
 *
 * @param lineOrigin - A point on the line
 * @param lineDirection - The line's direction, normalized
 * @param ray - The ray to find the closest point to (its direction must also
 * be normalized)
 */
export function closestPointOnLineToRay(
	lineOrigin: vec3,
	lineDirection: vec3,
	ray: Ray
): vec3 {
	// Derivation: minimize |lineOrigin + s*lineDirection - (ray.origin +
	// t*ray.direction)|^2 over s (t is unconstrained/unused - we only want
	// the point on the line, not on the ray). With both directions
	// normalized, a = lineDirection.lineDirection = 1 and c =
	// ray.direction.ray.direction = 1, which simplifies the usual
	// closest-point-between-two-lines formula.
	const w0 = vec3.subtract(vec3.create(), lineOrigin, ray.origin);
	const b = vec3.dot(lineDirection, ray.direction);
	const d = vec3.dot(lineDirection, w0);
	const e = vec3.dot(ray.direction, w0);

	const denominator = 1 - b * b;
	// denominator ~= 0 means the line and ray are (nearly) parallel - there's
	// no single well-defined closest point, so leave the line's own origin
	// where it is rather than divide by ~0 and send it flying.
	const s = Math.abs(denominator) < 1e-6 ? 0 : (b * e - d) / denominator;

	return vec3.scaleAndAdd(vec3.create(), lineOrigin, lineDirection, s);
}

/**
 * Finds where `ray` crosses the plane through `planePoint` with the given
 * (normalized) `planeNormal`. This is what the rotation gizmo drag is built
 * on: the cursor's ray is intersected with the plane perpendicular to the
 * rotation axis, through the object's pivot, and the angle of that
 * intersection point around the axis (see Math/Angles.ts) is the actual
 * rotation amount.
 *
 * Returns null for two degenerate cases a caller must handle explicitly
 * rather than receive a nonsensical point for: a ray (nearly) parallel to
 * the plane (e.g. the camera looking edge-on down the rotation axis) has no
 * single well-defined intersection, and a plane entirely behind the ray's
 * origin (t < 0) isn't a point the cursor could actually be "pointing at".
 */
export function intersectRayPlane(
	ray: Ray,
	planePoint: vec3,
	planeNormal: vec3
): vec3 | null {
	const denominator = vec3.dot(ray.direction, planeNormal);
	if (Math.abs(denominator) < 1e-6) {
		return null;
	}

	const toPlane = vec3.subtract(vec3.create(), planePoint, ray.origin);
	const t = vec3.dot(toPlane, planeNormal) / denominator;
	if (t < 0) {
		return null;
	}

	return vec3.scaleAndAdd(vec3.create(), ray.origin, ray.direction, t);
}
