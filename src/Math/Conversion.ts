import { mat3, vec3 } from "gl-matrix";

/**
 * Converts a 3x3 rotation matrix to a vector of Euler angles (x, y z)
 *
 * @param rotMat - The rotation to extract the Euler angles from
 * @returns - The vector containing the Euler angles
 */
function rotationMatrixToEulerAngles(rotMat: mat3): vec3 {
	const eps = 0.0001;
	let theta = 0;
	let phi = 0;
	let psi = 0;

	if (-rotMat[2] >= 1.0 - eps) {
		theta = Math.PI / 2;
		phi = Math.atan2(rotMat[3], rotMat[4]);
		psi = 0;
	} else if (-rotMat[2] <= -1.0 + eps) {
		theta = -Math.PI / 2;
		phi = Math.atan2(-rotMat[3], rotMat[4]);
		psi = 0;
	} else {
		theta = Math.asin(-rotMat[2]);
		const c = Math.cos(theta);
		phi = Math.atan2(rotMat[5] / c, rotMat[8] / c);
		psi = Math.atan2(rotMat[1] / c, rotMat[0] / c);
	}

	return vec3.fromValues(phi, theta, psi);
}

export { rotationMatrixToEulerAngles };
