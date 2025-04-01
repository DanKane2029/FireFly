import { vec3, mat4, quat, glMatrix, mat3, vec4 } from "gl-matrix";
import { UpdateFunction } from "./UpdateFunction";
import { rotationMatrixToEulerAngles } from "../Math/Conversion";

/**
 * Used to view objects in a scene and describes the perspective of the view on the screen
 */
class Camera {
	private _aspectRatio: number;
	private _perspectiveMatrix: mat4;
	private _viewMatrix: mat4;
	private _translation: vec3;
	private _rotation: vec3;
	private _transform: mat4;
	private _near: number;
	private _far: number;
	private _fovy: number;
	private _updateFunction: UpdateFunction;

	/**
	 * Creates a camera object
	 *
	 * @param aspectRatio - the ratio of screen width to screen height
	 * @param fovy - The angular extent of the observable world that is seen through the camera
	 * @param near - The distance to the origin of the camera where objects wont render if it is less than this value
	 * @param far - The distance to the origin of the camera where objects wont render if it is greater than this value
	 */
	constructor(aspectRatio: number, fovy: number, near: number, far: number) {
		this._aspectRatio = aspectRatio;
		this._fovy = fovy;
		this._near = near;
		this._far = far;
		this._perspectiveMatrix = mat4.perspective(
			mat4.create(),
			glMatrix.toRadian(fovy),
			this._aspectRatio,
			near,
			far
		);
		this._translation = vec3.fromValues(0, 0, 0);
		this._viewMatrix = mat4.create();
		this._rotation = [0, 0, 0];
		this._transform = mat4.create();
		this._updateFunction = () => undefined;
	}

	/**
	 * Gets the aspect ratio
	 */
	get aspectRatio(): number {
		return this._aspectRatio;
	}

	/**
	 * Sets the aspect ratio
	 */
	set aspectRatio(aspectRatio: number) {
		this._aspectRatio = aspectRatio;
	}

	/**
	 * Gets the perspective matrix of the camera
	 */
	get perspectiveMatrix(): mat4 {
		this._perspectiveMatrix = mat4.perspective(
			mat4.create(),
			glMatrix.toRadian(this._fovy),
			this._aspectRatio,
			this._near,
			this._far
		);
		return this._perspectiveMatrix;
	}

	/**
	 * Returns and calculates the view matrix of the camera
	 */
	get viewMatrix(): mat4 {
		const rotation: quat = quat.fromEuler(
			quat.create(),
			this._rotation[0],
			this._rotation[1],
			this._rotation[2]
		);
		mat4.fromRotationTranslation(
			this._transform,
			rotation,
			this._translation
		);
		return mat4.invert(this._viewMatrix, this._transform);
	}

	/**
	 * Gets the translation vector
	 */
	get translation(): vec3 {
		return this._translation;
	}

	/**
	 * Sets the translation vector
	 */
	set translation(vec: vec3) {
		this._translation = vec;
	}

	/**
	 * Gets the rotation of the camera in ZYX Euler angles
	 */
	get rotation(): vec3 {
		return this._rotation;
	}

	/**
	 * Sets the rotation of the camera in ZYX Euler angles
	 */
	set rotation(vec: vec3) {
		this._rotation = vec;
	}

	/**
	 * Rotates the camera
	 *
	 * @param dx - The amount to rotate around the x axis in degrees
	 * @param dy - The amount to rotate around the y axis in degrees
	 * @param dz - The amount to rotate around the z axis in degrees
	 */
	rotate(dx: number, dy: number, dz: number) {
		this._rotation = [
			this._rotation[0] + dx,
			this._rotation[1] + dy,
			this._rotation[2] + dz,
		];
	}

	/**
	 * Gets and calculates the transform matrix for the camera
	 */
	get transform(): mat4 {
		const r: quat = quat.fromEuler(
			quat.create(),
			this._rotation[0],
			this._rotation[1],
			this._rotation[2]
		);
		return mat4.fromRotationTranslation(
			this._transform,
			r,
			this.translation
		);
	}

	/**
	 * Rotates the camera so that the target position is center on screen
	 *
	 * @param targetPos - The position the camera will look at and will be center on the screen
	 * @returns - The forward, right, and up vectors that describe the new camera orientation
	 */
	lookAt(targetPos: vec3): { dir: vec3; right: vec3; up: vec3 } {
		const dir = vec3.create();
		vec3.sub(dir, this.translation, targetPos);
		vec3.normalize(dir, dir);

		const WORLD_UP = vec3.fromValues(0, 1, 0);
		const right = vec3.create();
		vec3.cross(right, dir, WORLD_UP);
		vec3.normalize(right, right);

		const up = vec3.create();
		vec3.cross(up, dir, right);
		vec3.normalize(up, up);

		const newRotMat = mat3.fromValues(
			right[0],
			right[1],
			right[2],
			up[0],
			up[1],
			up[2],
			dir[0],
			dir[1],
			dir[2]
		);

		const rotVec: vec3 = rotationMatrixToEulerAngles(newRotMat);

		this.rotation = vec3.fromValues(
			-(rotVec[0] * 180) / Math.PI + 180,
			(rotVec[1] * 180) / Math.PI + 180,
			(rotVec[2] * 180) / Math.PI
		);

		return { dir, right, up };
	}

	/**
	 * Sets the update function for the camera
	 */
	set updateFunction(updateFuntion: UpdateFunction) {
		this._updateFunction = updateFuntion;
	}

	/**
	 * Gets the update function for the camera
	 */
	get updateFunction(): UpdateFunction {
		return this._updateFunction;
	}
}

export { Camera };
