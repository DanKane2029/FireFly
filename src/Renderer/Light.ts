import { vec3 } from "gl-matrix";

/**
 * Light source radiating from a single point
 */
class PointLight {
	private _position: vec3;

	/**
	 * Creates a new point light at a 3D point
	 *
	 * @param position - The 3D position the point light is at
	 */
	constructor(position: vec3) {
		this._position = position;
	}

	/**
	 * Gets the position of the point light
	 */
	get position(): vec3 {
		return this._position;
	}

	/**
	 * Sets the position of the point light
	 */
	set position(position: vec3) {
		this._position = position;
	}
}

/**
 * A light source the radiates in a single direction
 */
class DirectionalLight {
	private _lightDirection: vec3;

	/**
	 * Creates a new directional light source object
	 *
	 * @param lightDirection - The direction the light source radiates from
	 */
	constructor(lightDirection: vec3) {
		this._lightDirection = lightDirection;
	}
}

export { PointLight, DirectionalLight };
