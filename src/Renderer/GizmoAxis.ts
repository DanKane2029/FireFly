import { vec3 } from "gl-matrix";
import { defineComponent } from "../ecs/Component";

/**
 * The gizmo's axis vectors and sizing math - kept separate from Gizmo.ts
 * (which builds the actual entity specs) specifically so this half stays
 * free of prefabs.ts's shared shader program import, which pulls in
 * webpack-only .glsl loading Jest can't transform. This file is what
 * GizmoController.ts (the input/drag-math side) and this file's own tests
 * depend on; only App.render() needs the geometry-building half.
 */

export type GizmoAxis = "x" | "y" | "z";

/**
 * Which of the gizmo's three drag behaviors is active. Only one mode's
 * handles ever exist as entities at a time (see App.render()'s gizmo entity
 * sync) - the previous mode's are destroyed before the new one's are spawned.
 */
export type GizmoMode = "translate" | "rotate" | "scale";

/**
 * Marks an entity as one of the gizmo's draggable axis handles, and which
 * axis it drags. Gizmo handles are real entities (Transform + MeshRef +
 * MaterialRef, like any other object - see Gizmo.ts/App.render()), so
 * GizmoController resolves a Picker hit back to an axis via this component
 * instead of a reserved-id scheme the way earlier versions of this gizmo
 * did; a real entity already has a real (positive) id of its own.
 */
export interface GizmoHandleData {
	axis: GizmoAxis;
}

export const GizmoHandle = defineComponent<GizmoHandleData>("GizmoHandle");

export const AXIS_VECTORS: Record<GizmoAxis, vec3> = {
	x: vec3.fromValues(1, 0, 0),
	y: vec3.fromValues(0, 1, 0),
	z: vec3.fromValues(0, 0, 1),
};

export function axisIndex(axis: GizmoAxis): 0 | 1 | 2 {
	return axis === "x" ? 0 : axis === "y" ? 1 : 2;
}

// How much of the gizmo's own screen-space size to keep constant regardless
// of camera distance - see worldSizeForDistance. Larger = a bigger gizmo.
const SCREEN_SIZE_FACTOR = 0.18;

/**
 * A gizmo whose screen size stays roughly constant regardless of zoom looks
 * right; a fixed world-space size would be huge up close and invisible from
 * far away. Scaling by distance-to-camera is the standard trick for that.
 */
export function worldSizeForDistance(distanceToCamera: number): number {
	return distanceToCamera * SCREEN_SIZE_FACTOR;
}
