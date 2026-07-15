import { vec3 } from "gl-matrix";
import { App } from "../App/App";
import { Controller } from "./Controller";
import { Entity } from "../ecs/World";
import { Transform } from "../ecs/components/Transform";
import { closestPointOnLineToRay, screenPointToWorldRay } from "../Math/Ray";
import {
	AXIS_VECTORS,
	GizmoAxis,
	axisForPickedId,
} from "../Renderer/GizmoAxis";

/**
 * Click an object to select it, same as SelectObjectController - but a
 * selected object grows draggable axis handles (App.render() builds them via
 * Gizmo.ts), and clicking one of those instead starts a drag that translates
 * the object along that axis. Supersedes SelectObjectController (a select
 * tool that never enables the gizmo is strictly weaker with no upsell), so
 * that class was deleted in favor of this one.
 *
 * Everything runs through mouseDown/mouseMove/mouseUp, not onClick, mirroring
 * OrbitalControls - a click event still fires after a drag's mouseup, and
 * handling selection there too would re-pick and potentially change the
 * selection right after finishing a drag.
 */
class GizmoController implements Controller {
	private _draggingAxis: GizmoAxis | null = null;
	private _dragEntity: Entity | null = null;
	// The translation the drag started from, and where its axis line was
	// first hit by the cursor - both fixed for the whole drag, so translation
	// is always computed as an absolute offset from the start rather than
	// accumulating per-frame deltas (which would drift).
	private _dragStartTranslation: vec3 | null = null;
	private _dragStartAxisPoint: vec3 | null = null;

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
			if (transform) {
				this._draggingAxis = axis;
				this._dragEntity = app.selectedId;
				this._dragStartTranslation = vec3.clone(transform.translation);
				this._dragStartAxisPoint = this.axisPointUnderCursor(
					app,
					event,
					transform.translation,
					axis
				);
				return;
			}
		}

		app.select(pickedId);
	}

	/**
	 * While dragging a handle, moves the entity along that axis by exactly
	 * however far the cursor has moved along it since the drag started.
	 *
	 * @param app - The application being interacted with
	 * @param event - The mouse event fired on move
	 */
	onMouseMove(app: App, event: MouseEvent): void {
		if (
			this._draggingAxis === null ||
			this._dragEntity === null ||
			!this._dragStartTranslation ||
			!this._dragStartAxisPoint ||
			!(event.target instanceof HTMLCanvasElement)
		) {
			return;
		}

		const transform = app.world.get(this._dragEntity, Transform);
		if (!transform) {
			return;
		}

		const currentAxisPoint = this.axisPointUnderCursor(
			app,
			event,
			this._dragStartTranslation,
			this._draggingAxis
		);
		const axisVector = AXIS_VECTORS[this._draggingAxis];
		const movedDelta = vec3.subtract(
			vec3.create(),
			currentAxisPoint,
			this._dragStartAxisPoint
		);
		const distanceAlongAxis = vec3.dot(movedDelta, axisVector);

		transform.translation = vec3.scaleAndAdd(
			vec3.create(),
			this._dragStartTranslation,
			axisVector,
			distanceAlongAxis
		);
		app.notifyChanged();
	}

	/** Ends the drag, if one was in progress. */
	onMouseUp(): void {
		this._draggingAxis = null;
		this._dragEntity = null;
		this._dragStartTranslation = null;
		this._dragStartAxisPoint = null;
	}

	/**
	 * Where the cursor's world-space ray comes closest to the given axis line
	 * (through `axisOrigin`, direction `axis`) - the "how far along the axis
	 * is the cursor pointing" measurement the drag is built on.
	 */
	private axisPointUnderCursor(
		app: App,
		event: MouseEvent,
		axisOrigin: vec3,
		axis: GizmoAxis
	): vec3 {
		const [ndcX, ndcY] = this.ndcPosition(app, event);
		const ray = screenPointToWorldRay(
			app.camera.perspectiveMatrix,
			app.camera.viewMatrix,
			ndcX,
			ndcY
		);
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
