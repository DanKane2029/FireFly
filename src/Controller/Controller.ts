import { Scene } from "../Renderer/Scene";

/**
 * Specifies all the user event callback functions that can fire when a user interact with the application.
 */
interface Controller {
	onClick?: (scene: Scene, event: MouseEvent) => void;
	onDrag?: (scene: Scene, event: MouseEvent) => void;
	onMouseMove?: (scene: Scene, event: MouseEvent) => void;
	onMouseDown?: (scene: Scene, event: MouseEvent) => void;
	onMouseUp?: (scene: Scene, event: MouseEvent) => void;
	onWheel?: (scene: Scene, event: WheelEvent) => void;
}

export { Controller };
