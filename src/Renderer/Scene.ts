import { vec3, vec4 } from "gl-matrix";

import { SceneObject } from "./SceneObject";
import { Camera } from "./Camera";
import { PointLight } from "./Light";

/**
 * Organizes the camera and objects that will be rendered to the screen
 */
class Scene {
	private _objectList: SceneObject[];
	private _lightList: PointLight[];
	private _ambientLight: vec3;
	private _camera: Camera;
	private _backgroundColor: vec4;
	private _deltaTime: number;
	private _time: number;

	/**
	 * Creates a new scene
	 *
	 * @param deltaTime - A number that defines how quickly time passes in the scene
	 */
	constructor(
		deltaTime: number,
		viewWidth: number,
		viewHeight: number,
		fov = 45,
		ambientLight = vec3.fromValues(0.1, 0.1, 0.1)
	) {
		this._objectList = [];
		this._lightList = [];
		this._deltaTime = deltaTime;
		this._time = 0;
		this._camera = new Camera(viewWidth / viewHeight, fov, 0.01, 1000);
		this._ambientLight = ambientLight;
	}

	/**
	 * Get the list of objects in the scene
	 */
	get objectList(): SceneObject[] {
		return this._objectList;
	}

	/**
	 * Sets the object list in the scene
	 */
	set objectList(objectList: SceneObject[]) {
		this._objectList = objectList;
	}

	/**
	 * Gets all the lights in the scene
	 */
	get lightList(): PointLight[] {
		return this._lightList;
	}

	/**
	 * Sets the light list in the scene
	 */
	set lightList(lightList: PointLight[]) {
		this._lightList = lightList;
	}

	/**
	 * Gets the ambient light value of the scene
	 */
	get ambientLight(): vec3 {
		return this._ambientLight;
	}

	/**
	 * Sets the ambient light value of the scene
	 */
	set ambientLight(ambientLight: vec3) {
		this._ambientLight = ambientLight;
	}

	/**
	 * Gets the camera in the scene
	 */
	get camera(): Camera {
		return this._camera;
	}

	/**
	 * Sets the camera in the scene
	 */
	set camera(camera: Camera) {
		this._camera = camera;
	}

	/**
	 * Gets the background color of the scene
	 */
	get backgroundColor(): vec4 {
		return this._backgroundColor;
	}

	/**
	 * Sets the background color of the scene
	 */
	set backgroundColor(color: vec4) {
		this._backgroundColor = color;
	}

	/**
	 * Gets the delta time in the scene
	 */
	get deltaTime(): number {
		return this._deltaTime;
	}

	/**
	 * Sets the detla time value in the scene
	 */
	set deltaTime(deltaTime: number) {
		this._deltaTime = deltaTime;
	}

	/**
	 * Gets the current time value of the scene
	 */
	get time(): number {
		return this._time;
	}

	/**
	 * Adds a new object to the scene
	 *
	 * @param object - The object to add to the scene
	 */
	addObject(object: SceneObject) {
		this._objectList.push(object);
	}

	/**
	 * Adds a light to the scene
	 *
	 * @param light - The light to add to the scene
	 */
	addLight(light: PointLight) {
		this._lightList.push(light);
	}

	/**
	 * Delets an object in the scene
	 *
	 * @param id - The ID of the object to delete
	 */
	deleteObject(id: string) {
		this._objectList = this._objectList.filter(
			(obj: SceneObject) => obj.id !== id
		);
	}

	/**
	 * Increments the scene's time value by the delta time value
	 */
	tick(): void {
		this._time += this._deltaTime;
	}

	/**
	 * Runs the camera's update function and the update funtion of every object in the scene
	 */
	updateFunction() {
		if (this.camera && this.camera.updateFunction) {
			this.camera.updateFunction(this.time, this.camera);
		}

		this.objectList.forEach((obj: SceneObject) => {
			if (obj.updateFunction) {
				obj.updateFunction(this.time, obj);
			}
		});
		this.tick();
	}

	/**
	 * Resets every object in the scene
	 */
	resetCreated(): void {
		this._objectList.forEach((obj: SceneObject) => {
			obj.resetCreated();
		});
	}
}

export { Scene };
