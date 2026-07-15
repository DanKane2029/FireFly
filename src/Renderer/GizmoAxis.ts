import { vec3 } from "gl-matrix";

/**
 * The gizmo's axis ids, vectors, and sizing math - kept separate from
 * Gizmo.ts (which builds the actual Renderables) specifically so this half
 * stays free of prefabs.ts's shared shader program import, which pulls in
 * webpack-only .glsl loading Jest can't transform. This file is what
 * GizmoController.ts (the input/drag-math side) and this file's own tests
 * depend on; only App.render() needs the geometry-building half.
 */

export type GizmoAxis = "x" | "y" | "z";

/**
 * Which of the gizmo's three drag behaviors is active. Only one mode's
 * handles are ever built into a frame's overlayRenderables at a time (see
 * Gizmo.ts's buildGizmoRenderables), so GIZMO_AXIS_IDS below is reused
 * unchanged across all three - there's no id collision to worry about.
 */
export type GizmoMode = "translate" | "rotate" | "scale";

/**
 * Reserved ids for the gizmo's handles. Negative, so they can never collide
 * with an entity id (World hands those out starting at 1) - and specifically
 * not -1, which the id-texture is cleared to and the Picker already reads
 * back as "nothing" (see Picker.pick).
 */
export const GIZMO_AXIS_IDS: Record<GizmoAxis, number> = {
	x: -2,
	y: -3,
	z: -4,
};

/** The inverse of GIZMO_AXIS_IDS, for resolving a Picker hit back to an axis. */
export function axisForPickedId(id: number | null): GizmoAxis | null {
	if (id === GIZMO_AXIS_IDS.x) return "x";
	if (id === GIZMO_AXIS_IDS.y) return "y";
	if (id === GIZMO_AXIS_IDS.z) return "z";
	return null;
}

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
