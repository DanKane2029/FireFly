import { Controller } from "./Controller";
import { vec2 } from "gl-matrix";
import { App } from "../App/App";
import { Entity } from "../ecs/World";
import { spawnCube } from "../ecs/prefabs";
import { Transform } from "../ecs/components/Transform";

/**
 * Adds a cube entity to the world when the user interacts with the canvas. On
 * mouse-down it spawns a cube and then scales it by how far the mouse is
 * dragged; a plain click drops a small cube at the origin.
 */
class AddCubeController implements Controller {
	private _mouseDownPoint: vec2 | undefined;
	private _cube: Entity | undefined;

	/**
	 * Spawns a cube entity and remembers it so drags can resize it.
	 *
	 * @param app - The application to add the cube to
	 * @param event - The mouse event fired when the mouse is pressed down
	 */
	onMouseDown(app: App, event: MouseEvent): void {
		if (event.target instanceof Element) {
			const x = (event.clientX / event.target.clientWidth - 0.5) * 2;
			const y = (1 - event.clientY / event.target.clientHeight - 0.5) * 2;
			this._mouseDownPoint = vec2.fromValues(x, y);
		}

		if (this._cube === undefined) {
			this._cube = spawnCube(app.world, { scale: [0.1, 0.1, 0.1] });
			app.notifyChanged();
		}
	}

	/**
	 * Adds a small cube at the center of the scene.
	 *
	 * @param app - The application to add the cube to
	 */
	onClick(app: App): void {
		spawnCube(app.world, {
			translation: [0, 0, 0],
			scale: [0.05, 0.05, 0.05],
		});
		app.notifyChanged();
	}

	/**
	 * Resets the state of the controller.
	 */
	onMouseUp(): void {
		this._mouseDownPoint = undefined;
		this._cube = undefined;
	}

	/**
	 * While the mouse is held down, scales the spawned cube by how far the mouse
	 * has been dragged from where it went down.
	 *
	 * @param app - The application being interacted with
	 * @param event - The mouse event fired when the mouse is moved
	 */
	onMouseMove(app: App, event: MouseEvent): void {
		if (
			this._mouseDownPoint &&
			this._cube !== undefined &&
			event.target instanceof Element
		) {
			const x = (event.clientX / event.target.clientWidth - 0.5) * 2;
			const y = (1 - event.clientY / event.target.clientHeight - 0.5) * 2;
			const curMousePos = vec2.fromValues(x, y);
			const mouseDirVec = vec2.create();
			vec2.sub(mouseDirVec, curMousePos, this._mouseDownPoint);
			const size = vec2.length(mouseDirVec);

			const transform = app.world.get(this._cube, Transform);
			if (transform) {
				transform.scale = [size, size, size];
			}
		}
	}
}

export { AddCubeController };
