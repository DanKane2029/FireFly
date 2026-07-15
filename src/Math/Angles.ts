import { vec3 } from "gl-matrix";

/**
 * Vector-angle helpers the rotation gizmo drag needs, layered on top of
 * Math/Ray.ts's ray-casting. Kept dependency-free/pure so it stays
 * Jest-testable, same reasoning as Ray.ts itself.
 */

/**
 * The component of `v` perpendicular to `planeNormal` (normalized) - `v`
 * with whatever it points along the normal subtracted out.
 */
export function projectOntoPlane(v: vec3, planeNormal: vec3): vec3 {
	const alongNormal = vec3.scale(
		vec3.create(),
		planeNormal,
		vec3.dot(v, planeNormal)
	);
	return vec3.subtract(vec3.create(), v, alongNormal);
}

/**
 * The signed angle (radians, right-hand rule) to rotate `from` by, about
 * `axis` (normalized), to point the same direction as `to`. `from`/`to`
 * don't need to already be perpendicular to `axis` - both are projected onto
 * the plane perpendicular to it first (see projectOntoPlane), so whatever
 * component either has along the axis itself is ignored rather than
 * corrupting the measurement.
 *
 * This is what turns "the cursor's ray now crosses the rotation plane at a
 * different point" (see Math/Ray.ts's intersectRayPlane) into an actual
 * rotation amount: `from`/`to` are that intersection point relative to the
 * rotation's center, at drag-start and now.
 */
export function signedAngleAroundAxis(
	axis: vec3,
	from: vec3,
	to: vec3
): number {
	const fromInPlane = projectOntoPlane(from, axis);
	const toInPlane = projectOntoPlane(to, axis);
	const cross = vec3.cross(vec3.create(), fromInPlane, toInPlane);
	return Math.atan2(vec3.dot(cross, axis), vec3.dot(fromInPlane, toInPlane));
}
