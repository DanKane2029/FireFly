import { Scene } from "../Renderer/Scene";
import { Renderer } from "../Renderer/Renderer";
import { Controller } from "../Controller/Controller";

// controllers
import { AddCubeController } from "../Controller/AddCube";
import { OrbitalControls } from "../Controller/OrbitalCamera";

import { cube } from "../SceneObjects/Cube";
import { createSnowman } from "../SceneObjects/Snowman";

/**
 * A class that holds and organizes the higher level functionality and objects that the application needs to run
 */
class App {
	private _deltaTime: number;
	private _scene: Scene;
	private _renderer: Renderer;
	private _canvasElement: HTMLCanvasElement;
	private _controller: Controller;

	/**
	 * Creates a new application instance
	 *
	 * @param canvasElement - The canvas DOM element that the app will render with
	 */
	constructor(canvasElement: HTMLCanvasElement) {
		this._canvasElement = canvasElement;
		this._deltaTime = 0.001;
		this._scene = new Scene(
			this._deltaTime,
			canvasElement.clientWidth,
			canvasElement.clientHeight
		);

		this._renderer = new Renderer(canvasElement.getContext("webgl2"));

		window.addEventListener("resize", () => {
			this._scene.camera.aspectRatio =
				canvasElement.clientWidth / canvasElement.clientHeight;
		});

		this._controller = new AddCubeController();
	}

	/**
	 * Gets the delta time value. Delta time is how fast time moves per application frame.
	 */
	get deltaTime(): number {
		return this._deltaTime;
	}

	/**
	 * Sets the delta time value. Delta time is how fast time moves per application frame.
	 */
	set detltaTime(deltaTime: number) {
		this._deltaTime = deltaTime;
	}

	/**
	 * Gets the scene the app uses
	 */
	get scene(): Scene {
		return this._scene;
	}

	/**
	 * Gets the renderer the app uses
	 */
	get renderer(): Renderer {
		return this._renderer;
	}

	/**
	 * Sets the user event callback functions to specify user interactivity based on a controller object.
	 *
	 * @param controller - The controller object that specifies the user interactivity.
	 */
	setController(controller: Controller): void {
		this._controller = controller;

		const onClickCallback = this._controller.onClick
			? (event: MouseEvent) => {
					this._controller.onClick(this._scene, event);
			  }
			: // eslint-disable-next-line @typescript-eslint/no-empty-function
			  () => {};
		this._canvasElement.onclick = onClickCallback;

		const onDragCallback = this._controller.onDrag
			? (event: MouseEvent) => {
					this._controller.onDrag(this._scene, event);
			  }
			: // eslint-disable-next-line @typescript-eslint/no-empty-function
			  () => {};
		this._canvasElement.ondrag = onDragCallback;

		const onMouseMoveCallback = this._controller.onMouseMove
			? (event: MouseEvent) => {
					this._controller.onMouseMove(this._scene, event);
			  }
			: // eslint-disable-next-line @typescript-eslint/no-empty-function
			  () => {};
		this._canvasElement.onmousemove = onMouseMoveCallback;

		const onMouseDownCallback = this._controller.onMouseDown
			? (event: MouseEvent) => {
					this._controller.onMouseDown(this._scene, event);
			  }
			: // eslint-disable-next-line @typescript-eslint/no-empty-function
			  () => {};
		this._canvasElement.onmousedown = onMouseDownCallback;

		const onMouseUpCallback = this._controller.onMouseUp
			? (event: MouseEvent) => {
					this._controller.onMouseUp(this._scene, event);
			  }
			: // eslint-disable-next-line @typescript-eslint/no-empty-function
			  () => {};
		this._canvasElement.onmouseup = onMouseUpCallback;

		const onWheelCallback = this._controller.onWheel
			? (event: WheelEvent) => {
					this._controller.onWheel(this._scene, event);
			  }
			: // eslint-disable-next-line @typescript-eslint/no-empty-function
			  () => {};
		this._canvasElement.onwheel = onWheelCallback;
	}

	/**
	 * Sets the app's controller that specifies the user input. The user can switch between controllers with specific key presses.
	 * o - Switches to orbital controlls
	 * c - Switches to Add Cube controlls
	 */
	setControllerSwitches(): void {
		this._canvasElement.addEventListener(
			"keydown",
			((event: KeyboardEvent) => {
				switch (event.key) {
					case "c":
						console.log("setting controls to Add Cube");
						this.setController(new AddCubeController());
						break;

					case "o":
						console.log("setting controls to Orbital");
						this.setController(new OrbitalControls());
						break;
				}
			}).bind(this)
		);
	}

	/**
	 * Is called once before the application runs. Is used to do any logic needed before the app runs.
	 */
	setup(): void {
		this.scene.backgroundColor = [0.05, 0.25, 0.05, 1.0];
		this.setController(new OrbitalControls());
		this.setControllerSwitches();

		this.scene.camera.translation = [0, 0, 2];
		this.scene.camera.lookAt([0, 0, 0]);

		const snowman = createSnowman();
		snowman.forEach((obj) => this.scene.addObject(obj));
	}

	/**
	 * Runs every frame and renders the current scene to the canvas.
	 */
	render(): void {
		this.scene.updateFunction();
		this.renderer.drawScene(this.scene);
	}

	/**
	 * Runs once when the app is shutdown
	 */
	teardown(): void {
		console.log("app teardown");
	}
}

export { App };
