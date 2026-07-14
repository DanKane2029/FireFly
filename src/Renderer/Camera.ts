import { vec3, mat4, mat3, quat, glMatrix } from "gl-matrix";

/**
 * Used to view objects in a scene and describes the perspective of the view on the screen.
 *
 * The camera exposes two matrices the renderer uploads every frame:
 * - the view matrix, which moves the world in front of the camera (it is the
 *   inverse of the camera's own world transform), and
 * - the perspective (projection) matrix, which applies the field-of-view
 *   frustum.
 * Both are cached and only recomputed when an input changes, so reading them
 * every frame does not allocate.
 *
 * Orientation is stored as a quaternion rather than Euler angles. A quaternion
 * can represent any rotation without the gimbal-lock singularity Euler angles
 * hit when the camera points straight up or down, which is what lets the orbital
 * controls swing smoothly over the poles.
 */
class Camera {
	private _aspectRatio: number;
	private _perspectiveMatrix: mat4;
	private _viewMatrix: mat4;
	private _translation: vec3;
	private _orientation: quat;
	private _near: number;
	private _far: number;
	private _fovy: number;

	// Cached matrices are only rebuilt when a dependency changes.
	private _perspectiveDirty: boolean;
	private _viewDirty: boolean;

	// Reused scratch object so recomputing the view matrix never allocates.
	private _scratchTransform: mat4;

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
		this._perspectiveMatrix = mat4.create();
		this._translation = vec3.fromValues(0, 0, 0);
		this._viewMatrix = mat4.create();
		this._orientation = quat.create(); // identity: looking down -Z

		this._perspectiveDirty = true;
		this._viewDirty = true;
		this._scratchTransform = mat4.create();
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
		this._perspectiveDirty = true;
	}

	/**
	 * Gets the vertical field of view, in degrees.
	 */
	get fovy(): number {
		return this._fovy;
	}

	/**
	 * Sets the vertical field of view, in degrees.
	 */
	set fovy(fovy: number) {
		this._fovy = fovy;
		this._perspectiveDirty = true;
	}

	/**
	 * Gets the perspective matrix of the camera. Rebuilt only when the
	 * field-of-view, aspect ratio, or clip planes change.
	 */
	get perspectiveMatrix(): mat4 {
		if (this._perspectiveDirty) {
			mat4.perspective(
				this._perspectiveMatrix,
				glMatrix.toRadian(this._fovy),
				this._aspectRatio,
				this._near,
				this._far
			);
			this._perspectiveDirty = false;
		}
		return this._perspectiveMatrix;
	}

	/**
	 * Gets the view matrix of the camera. The view matrix is the inverse of the
	 * camera's world transform, so it moves the world into the camera's frame.
	 * Rebuilt only when the camera's translation or rotation change.
	 */
	get viewMatrix(): mat4 {
		if (this._viewDirty) {
			// The camera's world transform places it in the scene; the view
			// matrix is that transform inverted (it moves the world into the
			// camera's frame).
			mat4.fromRotationTranslation(
				this._scratchTransform,
				this._orientation,
				this._translation
			);
			mat4.invert(this._viewMatrix, this._scratchTransform);
			this._viewDirty = false;
		}
		return this._viewMatrix;
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
		this._viewDirty = true;
	}

	/**
	 * Gets the camera's orientation quaternion (its local->world rotation).
	 */
	get orientation(): quat {
		return this._orientation;
	}

	/**
	 * Sets the camera's orientation quaternion.
	 */
	set orientation(orientation: quat) {
		this._orientation = orientation;
		this._viewDirty = true;
	}

	/**
	 * Orients the camera so that it looks at a target position.
	 *
	 * Builds an orthonormal camera basis (right, up, backward) and stores it as
	 * the orientation quaternion. The camera looks down its local -Z, so local
	 * +Z ("backward") points from the target back to the camera.
	 *
	 * @param targetPos - The world position to aim at (centered on screen).
	 * @param up - A hint for which way is up. If it happens to be parallel to
	 * the view direction (looking straight along it), a perpendicular axis is
	 * substituted so the basis never degenerates.
	 */
	lookAt(targetPos: vec3, up: vec3 = vec3.fromValues(0, 1, 0)): void {
		const backward = vec3.create();
		vec3.subtract(backward, this._translation, targetPos);
		if (vec3.length(backward) < 1e-6) {
			// Camera sits on the target; there is no direction to aim.
			return;
		}
		vec3.normalize(backward, backward);

		const right = vec3.create();
		vec3.cross(right, up, backward);
		if (vec3.length(right) < 1e-6) {
			// up is parallel to the view direction - pick any perpendicular axis.
			vec3.cross(right, vec3.fromValues(1, 0, 0), backward);
			if (vec3.length(right) < 1e-6) {
				vec3.cross(right, vec3.fromValues(0, 0, 1), backward);
			}
		}
		vec3.normalize(right, right);

		const trueUp = vec3.create();
		vec3.cross(trueUp, backward, right);
		vec3.normalize(trueUp, trueUp);

		// Columns [right, up, backward] form the local->world rotation matrix.
		const basis = mat3.fromValues(
			right[0],
			right[1],
			right[2],
			trueUp[0],
			trueUp[1],
			trueUp[2],
			backward[0],
			backward[1],
			backward[2]
		);

		const orientation = quat.create();
		quat.fromMat3(orientation, basis);
		quat.normalize(orientation, orientation);
		this.orientation = orientation;
	}
}

export { Camera };
