import { SceneObject } from "../Renderer/SceneObject";
import { cube } from "./Cube";

/**
 * Creates a snowman from different colored cubes.
 *
 * @returns - A snowman as a list of scene objects
 */
function createSnowman() {
	const snowman: SceneObject[] = [];

	const bottom = cube.clone();
	bottom.translation = [0.0, 0.3, 0];
	bottom.scale = [0.2, 0.2, 0.2];
	bottom.material.setProperty("color", [1, 1, 1, 1]);
	snowman.push(bottom);

	const middle = cube.clone();
	middle.translation = [0, -0.05, 0];
	middle.scale = [0.15, 0.15, 0.15];
	middle.material.setProperty("color", [1, 1, 1, 1]);
	snowman.push(middle);

	const head = cube.clone();
	head.translation = [0, -0.28, 0.0];
	head.scale = [0.1, 0.2, 0.1];
	head.material.setProperty("color", [1, 1, 1, 1]);
	snowman.push(head);

	const scarf = cube.clone();
	scarf.translation = [0, -0.25, 0.0];
	scarf.scale = [0.12, 0.05, 0.12];
	scarf.material.setProperty("color", [0.7, 0.1, 0.1, 1]);
	snowman.push(scarf);

	const scarf2 = cube.clone();
	scarf2.translation = [-0.071, -0.11, 0.13];
	scarf2.scale = [0.035, 0.1, 0.025];
	scarf2.material.setProperty("color", [0.7, 0.1, 0.1, 1]);
	snowman.push(scarf2);

	const topCoalBut = cube.clone();
	topCoalBut.translation = [0.0, -0.13, 0.145];
	topCoalBut.scale = [0.015, 0.015, 0.015];
	topCoalBut.material.setProperty("color", [0, 0, 0, 1]);
	snowman.push(topCoalBut);

	const midCoalBut = cube.clone();
	midCoalBut.translation = [0.0, -0.06, 0.145];
	midCoalBut.scale = [0.015, 0.015, 0.015];
	midCoalBut.material.setProperty("color", [0, 0, 0, 1]);
	snowman.push(midCoalBut);

	const botCoalBut = cube.clone();
	botCoalBut.translation = [0.0, 0.01, 0.145];
	botCoalBut.scale = [0.015, 0.015, 0.015];
	botCoalBut.material.setProperty("color", [0, 0, 0, 1]);
	snowman.push(botCoalBut);

	const rightEyeCoal = cube.clone();
	rightEyeCoal.translation = [0.04, -0.42, 0.1];
	rightEyeCoal.scale = [0.015, 0.015, 0.015];
	rightEyeCoal.material.setProperty("color", [0, 0, 0, 1]);
	snowman.push(rightEyeCoal);

	const leftEyeCoal = cube.clone();
	leftEyeCoal.translation = [-0.04, -0.42, 0.1];
	leftEyeCoal.scale = [0.015, 0.015, 0.015];
	leftEyeCoal.material.setProperty("color", [0, 0, 0, 1]);
	snowman.push(leftEyeCoal);

	const carrotNose = cube.clone();
	carrotNose.translation = [0.0, -0.38, 0.1];
	carrotNose.scale = [0.015, 0.015, 0.055];
	carrotNose.material.setProperty("color", [1, 0.5, 0, 1]);
	snowman.push(carrotNose);

	const smileCoal1 = cube.clone();
	smileCoal1.translation = [0.07, -0.35, 0.1];
	smileCoal1.scale = [0.012, 0.012, 0.012];
	smileCoal1.material.setProperty("color", [0, 0, 0, 1]);
	snowman.push(smileCoal1);

	const smileCoal2 = cube.clone();
	smileCoal2.translation = [0.035, -0.335, 0.1];
	smileCoal2.scale = [0.012, 0.012, 0.012];
	smileCoal2.material.setProperty("color", [0, 0, 0, 1]);
	snowman.push(smileCoal2);

	const smileCoal3 = cube.clone();
	smileCoal3.translation = [0.0, -0.33, 0.1];
	smileCoal3.scale = [0.012, 0.012, 0.012];
	smileCoal3.material.setProperty("color", [0, 0, 0, 1]);
	snowman.push(smileCoal3);

	const smileCoal4 = cube.clone();
	smileCoal4.translation = [-0.035, -0.335, 0.1];
	smileCoal4.scale = [0.012, 0.012, 0.012];
	smileCoal4.material.setProperty("color", [0, 0, 0, 1]);
	snowman.push(smileCoal4);

	const smileCoal5 = cube.clone();
	smileCoal5.translation = [-0.07, -0.35, 0.1];
	smileCoal5.scale = [0.012, 0.012, 0.012];
	smileCoal5.material.setProperty("color", [0, 0, 0, 1]);
	snowman.push(smileCoal5);

	return snowman;
}

export { createSnowman };
