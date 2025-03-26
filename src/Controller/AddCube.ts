import { Controller } from "./Controller";
import { Scene } from "../Renderer/Scene";
import { SceneObject } from "../Renderer/SceneObject";
import { cube } from "../SceneObjects/Cube";
import { vec2, vec3 } from "gl-matrix";

/**
 * Adds a cube to the scene with the user clicks the mouse button.
 */
class AddCubeController implements Controller {
	private _mouseDownPoint: vec2 | undefined;
	private _mouseDownCamPos: vec3 | undefined;
	private _sensitivity = 0.5;
	private _cube: SceneObject | undefined;

	/**
	 * Adds initial cube to scene and initializes a reference to it for future changes
	 *
	 * @param scene - The scene to add the cube to
	 * @param event - The mouse event fired when the mouse is pressed down
	 */
	onMouseDown(scene: Scene, event: MouseEvent): void {
		if (event.target instanceof Element) {
			const x = (event.clientX / event.target.clientWidth - 0.5) * 2;
			const y = (1 - event.clientY / event.target.clientHeight - 0.5) * 2;
			this._mouseDownPoint = vec2.fromValues(x, y);
		}
		this._mouseDownCamPos = scene.camera.translation;

		if (!this._cube) {
			this._cube = cube.clone();
			this._cube.scale = [0.1, 0.1, 0.1];
			scene.addObject(this._cube);
		}
	}

	/**
	 * Adds a cube to the center of the scene
	 *
	 * @param scene - The scene to add the cube to
	 */
	onClick(scene: Scene): void {
		const testCube = cube.clone();
		testCube.translation = [0, 0, 0];
		testCube.scale = [0.05, 0.05, 0.05];
		scene.addObject(testCube);
	}

	/**
	 * Resets the state of the controller
	 */
	onMouseUp(): void {
		this._mouseDownPoint = undefined;
		this._mouseDownCamPos = undefined;
		this._cube = undefined;
	}

	/**
	 * If the mouse is already pressed down it scales the size of the added cube based on how far you move the mouse.
	 *
	 * @param scene - The scene to add the cube to
	 * @param event - THe mouse event fired when the mouse is moved
	 */
	onMouseMove(scene: Scene, event: MouseEvent): void {
		if (this._mouseDownPoint && event.target instanceof Element) {
			// get mouse position
			const x = (event.clientX / event.target.clientWidth - 0.5) * 2;
			const y = (1 - event.clientY / event.target.clientHeight - 0.5) * 2;
			const curMousePos = vec2.fromValues(x, y);
			const mouseDirVec = vec2.create();
			vec2.sub(mouseDirVec, curMousePos, this._mouseDownPoint);
			const mouseVecLength = vec2.length(mouseDirVec);

			// if the cube is already created scale the size of the added cube
			if (this._cube) {
				this._cube.scale = [
					mouseVecLength,
					mouseVecLength,
					mouseVecLength,
				];
			}
		}
	}
}

export { AddCubeController };
