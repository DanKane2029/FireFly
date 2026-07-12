import { App } from "../App/App";
import { Camera } from "../Renderer/Camera";
import { Controller } from "./Controller";
import { vec3, vec2 } from "gl-matrix";
import {
	toSphericalCoord,
	toCatesianCoord,
} from "../Math/SphericalCoordinates";

/**
 * Orbital camera controls: drag the mouse to rotate the camera around the
 * origin (keeping it aimed at the origin), and scroll to move closer or
 * further away. Positions are tracked in spherical coordinates so the camera
 * stays on a sphere around the target.
 */
class OrbitalControls implements Controller {
	private _mouseDownPoint: vec2 | undefined;
	private _mouseDownCamPos: vec3 | undefined;
	private _sensitivity = 1.3;

	/**
	 * Moves the camera closer to or further from the origin.
	 *
	 * @param app - The application being interacted with
	 * @param event - The wheel event being fired
	 */
	onWheel(app: App, event: WheelEvent): void {
		const camera = app.scene.camera;
		const camSphericalCoord = toSphericalCoord(camera.translation);

		const zoomDir = event.deltaY < 0 ? -1 : 1;
		const zoomValue = 0.075;

		camSphericalCoord.radius += zoomDir * zoomValue;
		camSphericalCoord.radius = Math.max(0.001, camSphericalCoord.radius);
		camera.translation = toCatesianCoord(camSphericalCoord);
	}

	/**
	 * Initializes rotating the camera
	 *
	 * @param app - The application being interacted with
	 * @param event - The mouse event being fired
	 */
	onMouseDown(app: App, event: MouseEvent): void {
		if (event.target instanceof Element) {
			const x = (event.clientX / event.target.clientWidth - 0.5) * 2;
			const y = (1 - event.clientY / event.target.clientHeight - 0.5) * 2;
			this._mouseDownPoint = vec2.fromValues(x, y);
		}
		this._mouseDownCamPos = app.scene.camera.translation;
	}

	/**
	 * Resets the controller state
	 */
	onMouseUp(): void {
		this._mouseDownPoint = undefined;
		this._mouseDownCamPos = undefined;
	}

	/**
	 * If the mouse button is being pressed rotate the camera around the origin based on how far the mouse has been dragged.
	 *
	 * @param app - The application being interacted with
	 * @param event - The mouse event being fired
	 */
	onMouseMove(app: App, event: MouseEvent): void {
		if (this._mouseDownPoint && event.target instanceof Element) {
			// get mouse position
			const x = (event.clientX / event.target.clientWidth - 0.5) * 2;
			const y = (1 - event.clientY / event.target.clientHeight - 0.5) * 2;
			const curMousePos = vec2.fromValues(x, y);

			const cam: Camera = app.scene.camera;

			// get orthogonal vectors to camera direction
			const dir = vec3.create();
			vec3.sub(dir, vec3.fromValues(0, 0, 0), cam.translation);
			vec3.normalize(dir, dir);

			const WORLD_UP = vec3.fromValues(0, 1, 0);
			const right = vec3.create();
			vec3.cross(right, WORLD_UP, dir);
			vec3.normalize(right, right);

			const up = vec3.create();
			vec3.cross(up, dir, right);
			vec3.normalize(up, up);

			// get current mouse drag vector
			const mouseDirVec = vec2.create();
			vec2.sub(mouseDirVec, curMousePos, this._mouseDownPoint);

			const newCamPosition = vec3.create();

			// move in theta direction
			const moveRightVec = vec3.fromValues(0, 0, 0);
			vec3.scale(moveRightVec, right, mouseDirVec[0] * this._sensitivity);
			vec3.add(newCamPosition, this._mouseDownCamPos, moveRightVec);

			// move in phi direction
			const moveUpVec = vec3.fromValues(0, 0, 0);
			vec3.scale(moveUpVec, up, mouseDirVec[1] * -this._sensitivity);
			vec3.add(newCamPosition, newCamPosition, moveUpVec);

			// convert to spherical coord and lock radius
			const SphericalCoord = toSphericalCoord(newCamPosition);
			const radiusToOrigin = vec3.dist(
				cam.translation,
				vec3.fromValues(0, 0, 0)
			);
			SphericalCoord.radius = radiusToOrigin;

			// convert back to cartesian coord
			const cartesianCoord = toCatesianCoord(SphericalCoord);
			cam.translation = cartesianCoord;

			cam.lookAt(vec3.fromValues(0, 0, 0));
		}
	}
}

export { OrbitalControls };
