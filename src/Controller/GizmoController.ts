import { vec3 } from "gl-matrix";
import { App } from "../App/App";
import { Controller } from "./Controller";
import { Entity } from "../ecs/World";
import { Transform } from "../ecs/components/Transform";
import {
	Ray,
	closestPointOnLineToRay,
	intersectRayPlane,
	screenPointToWorldRay,
} from "../Math/Ray";
import { signedAngleAroundAxis } from "../Math/Angles";
import {
	AXIS_VECTORS,
	GizmoAxis,
	GizmoMode,
	axisForPickedId,
	axisIndex,
} from "../Renderer/GizmoAxis";

// A scale factor can never reach exactly zero or go negative through this
// drag - either would flip or collapse the mesh, which reads as broken
// rather than "very small".
const MIN_SCALE = 0.01;

/**
 * Click an object to select it, same as SelectObjectController - but a
 * selected object grows draggable axis handles (App.render() builds them via
 * Gizmo.ts), and clicking one of those instead starts a drag that moves,
 * rotates, or scales the object along that axis, depending on which mode is
 * active (see setMode). Supersedes SelectObjectController (a select tool
 * that never enables the gizmo is strictly weaker with no upsell), so that
 * class was deleted in favor of this one.
 *
 * Everything runs through mouseDown/mouseMove/mouseUp, not onClick, mirroring
 * OrbitalControls - a click event still fires after a drag's mouseup, and
 * handling selection there too would re-pick and potentially change the
 * selection right after finishing a drag.
 */
class GizmoController implements Controller {
	private _mode: GizmoMode = "translate";

	private _draggingAxis: GizmoAxis | null = null;
	private _dragEntity: Entity | null = null;
	// The object's translation at drag start - every mode's math is relative
	// to this fixed pivot rather than the object's live (moving/rotating)
	// state, so a drag never compounds its own effect frame over frame.
	private _dragStartTranslation: vec3 | null = null;

	// translate + scale: where the axis line was first hit by the cursor.
	private _dragStartAxisPoint: vec3 | null = null;
	// scale only: the scale to apply the drag's factor to, and the gizmo's
	// own on-screen length at drag start (the "one full handle length of
	// drag" normalization reference for the size-change factor).
	private _dragStartScale: vec3 | null = null;
	private _dragStartGizmoLength: number | null = null;
	// rotate only: the rotation to add the drag's angle to, and where the
	// cursor's ray first crossed the rotation plane.
	private _dragStartRotation: vec3 | null = null;
	private _dragStartPlanePoint: vec3 | null = null;

	/** Switches which of the three drag behaviors a handle drag performs.
	 * Cancels any drag already in progress first - finishing a translate
	 * drag using rotate's math (or vice versa) if the mode changed mid-drag
	 * would be nonsensical. */
	setMode(mode: GizmoMode): void {
		if (mode !== this._mode) {
			this.onMouseUp();
			this._mode = mode;
		}
	}

	/**
	 * Picks whatever is under the cursor. A gizmo handle starts a drag; an
	 * entity (or the background) is selected immediately, same as
	 * SelectObjectController.
	 *
	 * @param app - The application being interacted with
	 * @param event - The mouse event fired on press
	 */
	onMouseDown(app: App, event: MouseEvent): void {
		// Right button is reserved for the always-on camera orbit (see
		// OrbitalControls); only the left button drives this tool, so both can
		// be used without switching modes.
		if (
			event.button !== 0 ||
			!(event.target instanceof HTMLCanvasElement)
		) {
			return;
		}

		const pixel = this.idTexturePixel(app, event);
		const pickedId = app.picker.pick(pixel[0], pixel[1]);
		const axis = axisForPickedId(pickedId);

		if (axis && app.selectedId !== null) {
			const transform = app.world.get(app.selectedId, Transform);
			if (transform && this.startDrag(app, event, axis, transform)) {
				this._draggingAxis = axis;
				this._dragEntity = app.selectedId;
				return;
			}
		}

		app.select(pickedId);
	}

	/**
	 * Stashes whatever drag-start state the active mode's math needs.
	 * Returns false for rotate's one degenerate case (the cursor's ray
	 * doesn't cross the rotation plane - the camera is looking edge-on down
	 * the rotation axis), in which case no drag starts at all.
	 */
	private startDrag(
		app: App,
		event: MouseEvent,
		axis: GizmoAxis,
		transform: { translation: vec3; rotation: vec3; scale: vec3 }
	): boolean {
		this._dragStartTranslation = vec3.clone(transform.translation);

		if (this._mode === "translate") {
			this._dragStartAxisPoint = this.axisPointUnderCursor(
				app,
				event,
				transform.translation,
				axis
			);
			return true;
		}

		if (this._mode === "scale") {
			this._dragStartScale = vec3.clone(transform.scale);
			this._dragStartGizmoLength = vec3.distance(
				transform.translation,
				app.camera.translation
			);
			this._dragStartAxisPoint = this.axisPointUnderCursor(
				app,
				event,
				transform.translation,
				axis
			);
			return true;
		}

		// rotate
		const ray = this.worldRayUnderCursor(app, event);
		const planePoint = intersectRayPlane(
			ray,
			transform.translation,
			AXIS_VECTORS[axis]
		);
		if (!planePoint) {
			return false;
		}
		this._dragStartRotation = vec3.clone(transform.rotation);
		this._dragStartPlanePoint = planePoint;
		return true;
	}

	/**
	 * While dragging a handle, updates the entity's translation, rotation, or
	 * scale (depending on the active mode) to match how far/how much the
	 * cursor has moved since the drag started.
	 *
	 * @param app - The application being interacted with
	 * @param event - The mouse event fired on move
	 */
	onMouseMove(app: App, event: MouseEvent): void {
		if (
			this._draggingAxis === null ||
			this._dragEntity === null ||
			!this._dragStartTranslation ||
			!(event.target instanceof HTMLCanvasElement)
		) {
			return;
		}

		const transform = app.world.get(this._dragEntity, Transform);
		if (!transform) {
			return;
		}

		const axis = this._draggingAxis;
		const axisVector = AXIS_VECTORS[axis];
		const pivot = this._dragStartTranslation;

		if (this._mode === "translate" && this._dragStartAxisPoint) {
			const currentAxisPoint = this.axisPointUnderCursor(
				app,
				event,
				pivot,
				axis
			);
			const movedDelta = vec3.subtract(
				vec3.create(),
				currentAxisPoint,
				this._dragStartAxisPoint
			);
			const distanceAlongAxis = vec3.dot(movedDelta, axisVector);
			transform.translation = vec3.scaleAndAdd(
				vec3.create(),
				pivot,
				axisVector,
				distanceAlongAxis
			);
			app.notifyChanged();
			return;
		}

		if (
			this._mode === "scale" &&
			this._dragStartAxisPoint &&
			this._dragStartScale &&
			this._dragStartGizmoLength !== null
		) {
			const currentAxisPoint = this.axisPointUnderCursor(
				app,
				event,
				pivot,
				axis
			);
			const movedDelta = vec3.subtract(
				vec3.create(),
				currentAxisPoint,
				this._dragStartAxisPoint
			);
			const distanceAlongAxis = vec3.dot(movedDelta, axisVector);
			// One full gizmo-length of drag doubles the size; dragging back
			// past the pivot shrinks it, floored so it never flips/collapses.
			const factor = 1 + distanceAlongAxis / this._dragStartGizmoLength;
			const newScale = vec3.clone(this._dragStartScale);
			newScale[axisIndex(axis)] = Math.max(
				MIN_SCALE,
				this._dragStartScale[axisIndex(axis)] * factor
			);
			transform.scale = newScale;
			app.notifyChanged();
			return;
		}

		if (
			this._mode === "rotate" &&
			this._dragStartRotation &&
			this._dragStartPlanePoint
		) {
			const ray = this.worldRayUnderCursor(app, event);
			const currentPlanePoint = intersectRayPlane(ray, pivot, axisVector);
			if (!currentPlanePoint) {
				// Camera transiently looking edge-on down the axis mid-drag -
				// skip this frame rather than cancel the whole drag.
				return;
			}
			const fromVec = vec3.subtract(
				vec3.create(),
				this._dragStartPlanePoint,
				pivot
			);
			const toVec = vec3.subtract(
				vec3.create(),
				currentPlanePoint,
				pivot
			);
			// Transform.rotation is Euler DEGREES (see CLAUDE.md's rotation
			// trap) - signedAngleAroundAxis returns radians.
			const deltaDegrees =
				signedAngleAroundAxis(axisVector, fromVec, toVec) *
				(180 / Math.PI);
			const newRotation = vec3.clone(this._dragStartRotation);
			newRotation[axisIndex(axis)] =
				this._dragStartRotation[axisIndex(axis)] + deltaDegrees;
			transform.rotation = newRotation;
			app.notifyChanged();
		}
	}

	/** Ends the drag, if one was in progress. */
	onMouseUp(): void {
		this._draggingAxis = null;
		this._dragEntity = null;
		this._dragStartTranslation = null;
		this._dragStartAxisPoint = null;
		this._dragStartScale = null;
		this._dragStartGizmoLength = null;
		this._dragStartRotation = null;
		this._dragStartPlanePoint = null;
	}

	/** The cursor's current world-space ray - the shared starting point both
	 * axisPointUnderCursor (translate/scale) and the rotate plane
	 * intersection are built from. */
	private worldRayUnderCursor(app: App, event: MouseEvent): Ray {
		const [ndcX, ndcY] = this.ndcPosition(app, event);
		return screenPointToWorldRay(
			app.camera.perspectiveMatrix,
			app.camera.viewMatrix,
			ndcX,
			ndcY
		);
	}

	/**
	 * Where the cursor's world-space ray comes closest to the given axis line
	 * (through `axisOrigin`, direction `axis`) - the "how far along the axis
	 * is the cursor pointing" measurement translate and scale are both built
	 * on.
	 */
	private axisPointUnderCursor(
		app: App,
		event: MouseEvent,
		axisOrigin: vec3,
		axis: GizmoAxis
	): vec3 {
		const ray = this.worldRayUnderCursor(app, event);
		return closestPointOnLineToRay(axisOrigin, AXIS_VECTORS[axis], ray);
	}

	/** The cursor position in id-texture pixels (top-left origin), for
	 * Picker.pick - matches SelectObjectController's mapping. */
	private idTexturePixel(app: App, event: MouseEvent): [number, number] {
		const element = event.target as Element;
		const rect = element.getBoundingClientRect();
		const size = app.renderer.canvasSize;
		return [
			((event.clientX - rect.left) / rect.width) * size[0],
			((event.clientY - rect.top) / rect.height) * size[1],
		];
	}

	/** The cursor position in normalized device coordinates (each axis
	 * -1..1, GL convention, Y up) for screenPointToWorldRay. */
	private ndcPosition(app: App, event: MouseEvent): [number, number] {
		const element = event.target as Element;
		const rect = element.getBoundingClientRect();
		return [
			((event.clientX - rect.left) / rect.width) * 2 - 1,
			1 - ((event.clientY - rect.top) / rect.height) * 2,
		];
	}
}

export { GizmoController };
