import { vec3 } from "gl-matrix";

interface Light {
	getLightVector(position?: vec3): vec3;
}

class PointLight implements Light {
	private _position: vec3;

	constructor(position: vec3) {
		this._position = position;
	}

	get position(): vec3 {
		return this._position;
	}

	set position(position: vec3) {
		this._position = position;
	}

	getLightVector(position?: vec3): vec3 {
		const lightVector = vec3.create();
		vec3.sub(lightVector, this._position, position);
		vec3.normalize(lightVector, lightVector);
		return lightVector;
	}
}

class DirectionalLight implements Light {
	private _lightDirection: vec3;

	constructor(lightDirection: vec3) {
		this._lightDirection = lightDirection;
	}

	getLightVector(position?: vec3): vec3 {
		return vec3.fromValues(0, 0, 0);
	}
}

export { PointLight, DirectionalLight };
