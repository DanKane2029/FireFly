import { App } from "../App/App";

/**
 * Specifies all the user event callback functions that can fire when a user
 * interacts with the application.
 *
 * Every handler receives the whole App so it can reach whatever it needs -
 * the world (app.world), the camera (app.camera), the render backend
 * (app.backend), or picking (app.pick) - rather than each handler being handed
 * a different, narrower object. All handlers are optional; a controller
 * implements only the events it cares about.
 *
 * A handler may be `async` (GizmoController.onMouseDown is, since picking is):
 * the declared `void` return simply ignores the promise. Nothing awaits a
 * handler, so an async one must not assume the world is unchanged after it
 * resumes.
 */
interface Controller {
	onClick?: (app: App, event: MouseEvent) => void;
	onDrag?: (app: App, event: MouseEvent) => void;
	onMouseMove?: (app: App, event: MouseEvent) => void;
	onMouseDown?: (app: App, event: MouseEvent) => void;
	onMouseUp?: (app: App, event: MouseEvent) => void;
	onWheel?: (app: App, event: WheelEvent) => void;
}

export { Controller };
