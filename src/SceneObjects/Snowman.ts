import { SceneObject } from "../Renderer/SceneObject";
import { sphere } from "./Sphere";

/**
 * Creates a snowman from different colored cubes.
 *
 * @returns - A snowman as a list of scene objects
 */
function createSnowman() {
	const snowman: SceneObject[] = [];

	const bottom = sphere.clone();
	bottom.translation = [0.0, -0.3, 0];
	bottom.scale = [0.2, 0.2, 0.2];
	bottom.material.setProperty("color", [1, 1, 1, 1]);
	snowman.push(bottom);

	const middle = sphere.clone();
	middle.translation = [0, 0.0, 0];
	middle.scale = [0.15, 0.15, 0.15];
	middle.material.setProperty("color", [1, 1, 1, 1]);
	snowman.push(middle);

	const head = sphere.clone();
	head.translation = [0, 0.22, 0.0];
	head.scale = [0.1, 0.1, 0.1];
	head.material.setProperty("color", [1, 1, 1, 1]);
	snowman.push(head);

	const topCoalBut = sphere.clone();
	topCoalBut.translation = [0.0, 0.1, 0.12];
	topCoalBut.scale = [0.015, 0.015, 0.011];
	topCoalBut.rotation = [-40, 0, 0];
	topCoalBut.material.setProperty("color", [0, 0, 0, 1]);
	snowman.push(topCoalBut);

	const midCoalBut = sphere.clone();
	midCoalBut.translation = [0.0, 0.052, 0.145];
	midCoalBut.scale = [0.015, 0.015, 0.015];
	midCoalBut.material.setProperty("color", [0, 0, 0, 1]);
	snowman.push(midCoalBut);

	const botCoalBut = sphere.clone();
	botCoalBut.translation = [0.0, 0, 0.15];
	botCoalBut.scale = [0.015, 0.015, 0.015];
	botCoalBut.material.setProperty("color", [0, 0, 0, 1]);
	snowman.push(botCoalBut);

	const coalRightEye = sphere.clone();
	coalRightEye.translation = [0.035, 0.25, 0.08];
	coalRightEye.scale = [0.015, 0.015, 0.015];
	coalRightEye.material.setProperty("color", [0, 0, 0, 1]);
	snowman.push(coalRightEye);

	const coalLeftEye = sphere.clone();
	coalLeftEye.translation = [-0.035, 0.25, 0.08];
	coalLeftEye.scale = [0.015, 0.015, 0.015];
	coalLeftEye.material.setProperty("color", [0, 0, 0, 1]);
	snowman.push(coalLeftEye);

	const carrotNose = sphere.clone();
	carrotNose.translation = [0, 0.22, 0.1];
	carrotNose.scale = [0.01, 0.01, 0.05];
	carrotNose.material.setProperty("color", [0.8, 0.4, 0, 1]);
	snowman.push(carrotNose);

	return snowman;
}

export { createSnowman };
