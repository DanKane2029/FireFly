import { SceneObject } from "./SceneObject";
import { Camera } from "./Camera";

/**
 * An optional function that runs for every scene object and camera in the scene.
 * It takes the current time and scene object as parameters and can edit the scene object.
 */
type UpdateFunction = (
	time: number,
	object: SceneObject | Camera
) => void | (() => undefined);

export { UpdateFunction };
