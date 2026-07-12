import { App } from "../App/App";
import { Controller } from "./Controller";

/**
 * Click an object to select it. The click position is handed to the Picker,
 * which reads back the object id drawn at that pixel (GPU picking); the picked
 * id is then stored in the app's selection so panels (e.g. the Inspector) can
 * react to it.
 */
class SelectObjectController implements Controller {
	/**
	 * Resolves the click to an object id and selects it (or clears the selection
	 * when the background is clicked).
	 *
	 * @param app - The application being interacted with
	 * @param event - The mouse event fired when the canvas is clicked
	 */
	onClick(app: App, event: MouseEvent): void {
		if (!(event.target instanceof HTMLCanvasElement)) {
			return;
		}

		// Map the click from CSS pixels to id-texture pixels (top-left origin).
		const rect = event.target.getBoundingClientRect();
		const size = app.renderer.canvasSize;
		const x = ((event.clientX - rect.left) / rect.width) * size[0];
		const y = ((event.clientY - rect.top) / rect.height) * size[1];

		app.select(app.picker.pick(x, y));
	}
}

export { SelectObjectController };
