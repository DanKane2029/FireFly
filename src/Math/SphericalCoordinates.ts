import { vec3 } from "gl-matrix";

/**
 * A 3D point in space on a theoretical
 */
interface SphericalCoord {
	radius: number;
	theta: number;
	phi: number;
}

function toSphericalCoord(cartesianCoord: vec3): SphericalCoord {
	const x = cartesianCoord[0];
	const y = cartesianCoord[1];
	const z = cartesianCoord[2];

	const radius = Math.sqrt(x * x + y * y + z * z);
	const phi = Math.atan2(y, x);
	const theta = Math.acos(z / radius);

	return { radius, phi, theta };
}

function toCatesianCoord(polarCoord: SphericalCoord): vec3 {
	const x =
		polarCoord.radius *
		Math.sin(polarCoord.theta) *
		Math.cos(polarCoord.phi);
	const y =
		polarCoord.radius *
		Math.sin(polarCoord.theta) *
		Math.sin(polarCoord.phi);

	const z = polarCoord.radius * Math.cos(polarCoord.theta);

	return vec3.fromValues(x, y, z);
}

export { toSphericalCoord, toCatesianCoord, SphericalCoord };
