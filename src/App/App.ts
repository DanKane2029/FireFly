import { Scene } from "../Renderer/Scene";
import { Renderer } from "../Renderer/Renderer";
import { Picker } from "../Renderer/Picker";
import { Controller } from "../Controller/Controller";

// controllers
import { AddCubeController } from "../Controller/AddCube";
import { OrbitalControls } from "../Controller/OrbitalCamera";
import { SelectObjectController } from "../Controller/SelectObject";

import { createSnowman } from "../SceneObjects/Snowman";
import { PointLight } from "../Renderer/Light";
import { vec2 } from "gl-matrix";

/**
 * A class that holds and organizes the higher level functionality and objects that the application needs to run
 */
class App {
	private _deltaTime: number;
	private _scene: Scene;
	private _renderer: Renderer;
	private _picker: Picker;
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
		this._canvasElement.width = canvasElement.clientWidth;
		this._canvasElement.height = canvasElement.clientHeight;
		this._scene = new Scene(
			this._deltaTime,
			canvasElement.clientWidth,
			canvasElement.clientHeight
		);

		// antialias must be false: the default framebuffer would otherwise be
		// multisampled, and blitFramebuffer (used to copy the rendered image to
		// the canvas) cannot write into a multisampled framebuffer.
		const gl = canvasElement.getContext("webgl2", {
			preserveDrawingBuffer: true,
			antialias: false,
		});
		if (gl === null) {
			throw new Error("WebGL2 is not supported in this browser.");
		}

		this._renderer = new Renderer(
			gl,
			vec2.fromValues(
				canvasElement.clientWidth,
				canvasElement.clientHeight
			)
		);

		this._picker = new Picker(
			this._renderer.context,
			this._renderer.frameBuffer,
			this._renderer.canvasSize
		);

		window.addEventListener("resize", () => {
			this._canvasElement.width = canvasElement.clientWidth;
			this._canvasElement.height = canvasElement.clientHeight;

			this._scene.camera.aspectRatio =
				canvasElement.clientWidth / canvasElement.clientHeight;

			this.renderer.setViewport(
				canvasElement.clientWidth,
				canvasElement.clientHeight
			);
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
	 * Gets the picker the app uses to resolve clicks to scene objects
	 */
	get picker(): Picker {
		return this._picker;
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
					this._controller.onClick?.(this, event);
			  }
			: // eslint-disable-next-line @typescript-eslint/no-empty-function
			  () => {};
		this._canvasElement.onclick = onClickCallback;

		const onDragCallback = this._controller.onDrag
			? (event: MouseEvent) => {
					this._controller.onDrag?.(this, event);
			  }
			: // eslint-disable-next-line @typescript-eslint/no-empty-function
			  () => {};
		this._canvasElement.ondrag = onDragCallback;

		const onMouseMoveCallback = this._controller.onMouseMove
			? (event: MouseEvent) => {
					this._controller.onMouseMove?.(this, event);
			  }
			: // eslint-disable-next-line @typescript-eslint/no-empty-function
			  () => {};
		this._canvasElement.onmousemove = onMouseMoveCallback;

		const onMouseDownCallback = this._controller.onMouseDown
			? (event: MouseEvent) => {
					this._controller.onMouseDown?.(this, event);
			  }
			: // eslint-disable-next-line @typescript-eslint/no-empty-function
			  () => {};
		this._canvasElement.onmousedown = onMouseDownCallback;

		const onMouseUpCallback = this._controller.onMouseUp
			? (event: MouseEvent) => {
					this._controller.onMouseUp?.(this, event);
			  }
			: // eslint-disable-next-line @typescript-eslint/no-empty-function
			  () => {};
		this._canvasElement.onmouseup = onMouseUpCallback;

		const onWheelCallback = this._controller.onWheel
			? (event: WheelEvent) => {
					this._controller.onWheel?.(this, event);
			  }
			: // eslint-disable-next-line @typescript-eslint/no-empty-function
			  () => {};
		this._canvasElement.onwheel = onWheelCallback;
	}

	/**
	 * Sets the app's controller that specifies the user input. The user can switch between controllers with specific key presses.
	 * o - Switches to orbital controlls
	 * c - Switches to Add Cube controlls
	 * s - Switches to Select Object controls
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

					case "s":
						console.log("setting controls to Select Object");
						this.setController(new SelectObjectController());
						break;
				}
			}).bind(this)
		);
	}

	/**
	 * Is called once before the application runs. Is used to do any logic needed before the app runs.
	 */
	setup(): void {
		this.scene.backgroundColor = [0.2, 0.2, 0.2, 1.0];
		this.scene.ambientLight = [0.1, 0.1, 0.1];
		this.setController(new OrbitalControls());
		this.setControllerSwitches();

		this.scene.camera.translation = [0, 0, 2];
		this.scene.camera.lookAt([0, 0, 0]);

		const light = new PointLight([5, 0, 10]);
		this.scene.addLight(light);

		const snowman = createSnowman();
		snowman.forEach((obj) => this.scene.addObject(obj));

		// One-time framebuffer + GL state setup, now that the scene's objects
		// and background color are in place.
		this.renderer.initScene(this.scene);
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
