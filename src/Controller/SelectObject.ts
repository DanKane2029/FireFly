import { App } from "../App/App";
import { Controller } from "./Controller";
import { SceneObject } from "../Renderer/SceneObject";

/**
 * Click an object to select it. The click position is handed to the Picker,
 * which reads back the object id drawn at that pixel (GPU picking); the
 * matching SceneObject is then looked up in the scene by id.
 */
class SelectObjectController implements Controller {
	private _selected: SceneObject | undefined;

	/**
	 * Resolves the click to a scene object and selects it (or clears the
	 * selection when the background is clicked).
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

		const id = app.picker.pick(x, y);

		this._selected =
			id === null
				? undefined
				: app.scene.objectList.find((obj) => obj.id === id);

		if (this._selected) {
			console.log(
				`selected object #${this._selected.id} (${this._selected.name})`
			);
		} else {
			console.log("selected nothing (background)");
		}
	}

	/**
	 * The object currently selected, if any.
	 */
	get selected(): SceneObject | undefined {
		return this._selected;
	}
}

export { SelectObjectController };
