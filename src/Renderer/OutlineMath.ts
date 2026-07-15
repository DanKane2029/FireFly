import { mat4 } from "gl-matrix";

/**
 * Scales a world transform up by `factor` about the object's own local
 * origin (its pivot), rather than the world origin - pre-multiplying the
 * scale onto the transform applies it before the transform's own rotation
 * and translation, so the object grows outward from its own center no
 * matter where it sits or how it's rotated in the world. This is the whole
 * mechanism behind the selection outline (see Outline.ts): draw the
 * selected mesh again, slightly larger, with only its backfaces visible -
 * the sliver of the larger copy that pokes out past the real mesh is the
 * outline.
 *
 * Kept dependency-free (no GL/prefabs import) so it stays Jest-testable,
 * mirroring GizmoAxis.ts's split from the GL-dependent Gizmo.ts.
 */
export function scaleAboutLocalOrigin(transform: mat4, factor: number): mat4 {
	return mat4.multiply(
		mat4.create(),
		transform,
		mat4.fromScaling(mat4.create(), [factor, factor, factor])
	);
}
