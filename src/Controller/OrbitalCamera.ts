import { App } from "../App/App";
import { Controller } from "./Controller";
import { vec2, vec3, quat } from "gl-matrix";

// The point the camera orbits around and keeps aimed at.
const TARGET = vec3.fromValues(0, 0, 0);
// How close the camera may zoom toward the target.
const MIN_RADIUS = 0.05;

/**
 * Trackball orbital controls: drag to rotate the camera around the target, and
 * scroll to move closer or further away.
 *
 * Rather than tracking a latitude/longitude on a sphere (which has a singularity
 * at the poles - the camera flips when it points straight up or down), each drag
 * applies an incremental rotation about the camera's *own* right and up axes.
 * Both the camera's orientation and its position are rotated by that same delta,
 * so the camera keeps looking at the target while its "up" carries along freely.
 * This lets the view roll continuously over the top and bottom with no flip.
 */
class OrbitalControls implements Controller {
	private _lastPointer: vec2 | undefined;
	// Radians of rotation per full screen-width (or height) of drag.
	private _rotationSensitivity = Math.PI;
	// Fraction of the current distance added/removed per wheel notch.
	private _zoomSensitivity = 0.1;

	/**
	 * Begins a drag by recording where the pointer went down.
	 *
	 * @param app - The application being interacted with
	 * @param event - The mouse event being fired
	 */
	onMouseDown(app: App, event: MouseEvent): void {
		this._lastPointer = this.pointer(event);
	}

	/**
	 * Ends the drag.
	 */
	onMouseUp(): void {
		this._lastPointer = undefined;
	}

	/**
	 * While dragging, rotates the camera around the target by the pointer's
	 * movement since the last frame.
	 *
	 * @param app - The application being interacted with
	 * @param event - The mouse event being fired
	 */
	onMouseMove(app: App, event: MouseEvent): void {
		if (!this._lastPointer || !(event.target instanceof Element)) {
			return;
		}

		const current = this.pointer(event);
		const dx = current[0] - this._lastPointer[0];
		const dy = current[1] - this._lastPointer[1];
		this._lastPointer = current;

		const camera = app.camera;
		const orientation = camera.orientation;

		// The camera's current up and right axes, in world space. Rotating about
		// these (rather than a fixed world up) is what keeps the controls behaving
		// the same no matter how the camera is oriented - including upside down.
		const camUp = vec3.transformQuat(
			vec3.create(),
			vec3.fromValues(0, 1, 0),
			orientation
		);
		const camRight = vec3.transformQuat(
			vec3.create(),
			vec3.fromValues(1, 0, 0),
			orientation
		);

		// Horizontal drag yaws about the up axis; vertical drag pitches about the
		// right axis. Negated so the scene follows the cursor.
		const yaw = -dx * this._rotationSensitivity;
		const pitch = -dy * this._rotationSensitivity;

		const delta = quat.setAxisAngle(quat.create(), camUp, yaw);
		const pitchRotation = quat.setAxisAngle(quat.create(), camRight, pitch);
		quat.multiply(delta, delta, pitchRotation);
		quat.normalize(delta, delta);

		// Re-orient the camera and swing its position around the target by the
		// same rotation, so it stays aimed at the target.
		const newOrientation = quat.multiply(quat.create(), delta, orientation);
		quat.normalize(newOrientation, newOrientation);
		camera.orientation = newOrientation;

		const offset = vec3.subtract(vec3.create(), camera.translation, TARGET);
		vec3.transformQuat(offset, offset, delta);
		camera.translation = vec3.add(vec3.create(), TARGET, offset);
	}

	/**
	 * Moves the camera closer to or further from the target.
	 *
	 * @param app - The application being interacted with
	 * @param event - The wheel event being fired
	 */
	onWheel(app: App, event: WheelEvent): void {
		const camera = app.camera;
		const offset = vec3.subtract(vec3.create(), camera.translation, TARGET);

		// Scroll up (deltaY < 0) zooms in; scaling the offset keeps the view
		// direction unchanged, so the camera stays aimed at the target.
		const factor =
			event.deltaY < 0
				? 1 - this._zoomSensitivity
				: 1 + this._zoomSensitivity;
		vec3.scale(offset, offset, factor);

		if (vec3.length(offset) < MIN_RADIUS) {
			vec3.normalize(offset, offset);
			vec3.scale(offset, offset, MIN_RADIUS);
		}

		camera.translation = vec3.add(vec3.create(), TARGET, offset);
	}

	/**
	 * The pointer position as a fraction of the canvas (0..1 across each axis),
	 * so drag sensitivity is independent of the canvas resolution.
	 */
	private pointer(event: MouseEvent): vec2 {
		const element = event.target as Element;
		return vec2.fromValues(
			event.clientX / element.clientWidth,
			event.clientY / element.clientHeight
		);
	}
}

export { OrbitalControls };
