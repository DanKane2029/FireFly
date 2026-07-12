import { Scene } from "../Renderer/Scene";
import { Renderer } from "../Renderer/Renderer";
import { Picker } from "../Renderer/Picker";
import { Controller } from "../Controller/Controller";

// controllers
import { AddCubeController } from "../Controller/AddCube";
import { OrbitalControls } from "../Controller/OrbitalCamera";
import { SelectObjectController } from "../Controller/SelectObject";

import { createSnowman } from "../SceneObjects/Snowman";
import { createBunnyScene } from "../SceneObjects/Bunny";
import { createDragonScene } from "../SceneObjects/Dragon";
import { SceneObject } from "../Renderer/SceneObject";
import { PointLight } from "../Renderer/Light";
import { vec2 } from "gl-matrix";

/**
 * The selectable test scenes, each a factory that builds a fresh set of objects.
 * The Renderer uploads whatever objects are in the scene lazily, so swapping
 * `Scene.objectList` to another factory's output is all a scene switch needs.
 */
const SCENES: Record<string, () => SceneObject[]> = {
	snowman: createSnowman,
	bunny: createBunnyScene,
	dragon: createDragonScene,
};

/**
 * The persistent core of the application: it owns the Scene (the 3D world), the
 * active input controller, and a small store of editor UI state (the current
 * selection). It deliberately does NOT own the canvas or WebGL context - those
 * belong to whichever Scene panel is currently displaying the world.
 *
 * This split is what lets the docking UI treat the 3D view as just another
 * panel: the App lives for the whole session, while the Scene panel calls
 * `attachCanvas` when it mounts and `detachCanvas` when it unmounts. The App
 * also exposes a tiny subscribe/getSnapshot store so React panels can observe
 * the scene and selection via `useSyncExternalStore`.
 */
class App {
	private _deltaTime: number;
	private _scene: Scene;
	private _controller: Controller;

	// Set only while a Scene panel is displaying the world.
	private _renderer: Renderer | undefined;
	private _picker: Picker | undefined;
	private _canvasElement: HTMLCanvasElement | undefined;
	private _keydownHandler: ((event: KeyboardEvent) => void) | undefined;

	// --- editor UI store (observed by React panels) ---
	private _selectedId: number | null;
	private _version: number;
	private _listeners: Set<() => void>;

	/**
	 * Creates the application and builds the initial world. No canvas or GL
	 * context is created here; call `attachCanvas` once a canvas exists.
	 */
	constructor() {
		this._deltaTime = 0.001;
		// Aspect ratio is a placeholder until a canvas is attached / resized.
		this._scene = new Scene(this._deltaTime, 1, 1);
		this._controller = new OrbitalControls();

		this._selectedId = null;
		this._version = 0;
		this._listeners = new Set();

		this.buildWorld();
	}

	/**
	 * Sets up the lights, camera, and starting scene. Runs once at construction;
	 * needs no renderer.
	 */
	private buildWorld(): void {
		this._scene.backgroundColor = [0.2, 0.2, 0.2, 1.0];
		this._scene.ambientLight = [0.1, 0.1, 0.1];

		this._scene.camera.translation = [0, 0, 2];
		this._scene.camera.lookAt([0, 0, 0]);

		this._scene.addLight(new PointLight([5, 0, 10]));

		// Start on the snowman scene; press 2 / 3 to switch to the bunny / dragon.
		this.loadScene("snowman");
	}

	/**
	 * Attaches a canvas so the world can be displayed and interacted with. Called
	 * by the Scene panel when it mounts. Creates the WebGL context, renderer, and
	 * picker, and wires up mouse + keyboard input.
	 *
	 * @param canvas - The canvas the Scene panel owns
	 */
	attachCanvas(canvas: HTMLCanvasElement): void {
		this._canvasElement = canvas;

		// antialias must be false: the default framebuffer would otherwise be
		// multisampled, and blitFramebuffer (used to copy the rendered image to
		// the canvas) cannot write into a multisampled framebuffer.
		const gl = canvas.getContext("webgl2", {
			preserveDrawingBuffer: true,
			antialias: false,
		});
		if (gl === null) {
			throw new Error("WebGL2 is not supported in this browser.");
		}

		this._renderer = new Renderer(
			gl,
			vec2.fromValues(canvas.width, canvas.height)
		);
		this._picker = new Picker(
			this._renderer.context,
			this._renderer.frameBuffer,
			this._renderer.canvasSize
		);

		this._scene.camera.aspectRatio = canvas.width / canvas.height;
		this._renderer.initScene(this._scene);

		this.setController(this._controller);
		this.bindKeyboard();
	}

	/**
	 * Detaches the current canvas, removing input handlers and dropping the
	 * renderer/picker. The Scene (the world) is left untouched so it survives the
	 * panel being closed and reopened. Called when the Scene panel unmounts.
	 */
	detachCanvas(): void {
		if (this._canvasElement) {
			this._canvasElement.onclick = null;
			this._canvasElement.ondrag = null;
			this._canvasElement.onmousemove = null;
			this._canvasElement.onmousedown = null;
			this._canvasElement.onmouseup = null;
			this._canvasElement.onwheel = null;
			if (this._keydownHandler) {
				this._canvasElement.removeEventListener(
					"keydown",
					this._keydownHandler
				);
			}
		}
		this._keydownHandler = undefined;
		this._renderer = undefined;
		this._picker = undefined;
		this._canvasElement = undefined;
	}

	/**
	 * Resizes the attached canvas, framebuffer, and camera to a new pixel size.
	 * Called by the Scene panel when its container changes size. No-op if no
	 * canvas is attached.
	 *
	 * @param width - New width in device pixels
	 * @param height - New height in device pixels
	 */
	resize(width: number, height: number): void {
		if (!this._renderer || !this._canvasElement) {
			return;
		}
		const w = Math.max(1, Math.floor(width));
		const h = Math.max(1, Math.floor(height));
		this._canvasElement.width = w;
		this._canvasElement.height = h;
		this._renderer.resize(w, h);
		this._scene.camera.aspectRatio = w / h;
	}

	/**
	 * Gets the delta time value. Delta time is how fast time moves per application frame.
	 */
	get deltaTime(): number {
		return this._deltaTime;
	}

	/**
	 * Gets the scene the app uses
	 */
	get scene(): Scene {
		return this._scene;
	}

	/**
	 * Gets the renderer the app uses. Only valid while a Scene panel is attached.
	 */
	get renderer(): Renderer {
		if (!this._renderer) {
			throw new Error("No renderer: attach a canvas before rendering.");
		}
		return this._renderer;
	}

	/**
	 * Gets the picker the app uses to resolve clicks to scene objects. Only valid
	 * while a Scene panel is attached.
	 */
	get picker(): Picker {
		if (!this._picker) {
			throw new Error("No picker: attach a canvas before picking.");
		}
		return this._picker;
	}

	/**
	 * Whether a canvas is currently attached (and rendering is possible).
	 */
	get isAttached(): boolean {
		return this._renderer !== undefined;
	}

	// --- editor UI store -----------------------------------------------------

	/**
	 * Subscribes a listener to store changes (selection or scene mutations).
	 * Shaped for React's `useSyncExternalStore`. Returns an unsubscribe function.
	 */
	subscribe = (listener: () => void): (() => void) => {
		this._listeners.add(listener);
		return () => {
			this._listeners.delete(listener);
		};
	};

	/**
	 * Returns a version number that changes whenever the store changes, so
	 * `useSyncExternalStore` knows to re-read.
	 */
	getSnapshot = (): number => {
		return this._version;
	};

	/**
	 * Bumps the version and notifies subscribers.
	 */
	private emit(): void {
		this._version++;
		this._listeners.forEach((listener) => listener());
	}

	/**
	 * Signals that the scene's contents changed (object added/removed, material
	 * edited) so observing panels re-render.
	 */
	notifyChanged(): void {
		this.emit();
	}

	/**
	 * The id of the currently selected object, or null if nothing is selected.
	 */
	get selectedId(): number | null {
		return this._selectedId;
	}

	/**
	 * The currently selected object, or undefined if nothing is selected.
	 */
	get selectedObject(): SceneObject | undefined {
		if (this._selectedId === null) {
			return undefined;
		}
		return this._scene.objectList.find((obj) => obj.id === this._selectedId);
	}

	/**
	 * Selects an object by id (or clears the selection with null).
	 *
	 * @param id - The object id to select, or null for no selection
	 */
	select(id: number | null): void {
		if (id !== this._selectedId) {
			this._selectedId = id;
			this.emit();
		}
	}

	// --- input ---------------------------------------------------------------

	/**
	 * Sets the user event callback functions to specify user interactivity based
	 * on a controller object. No-op if no canvas is attached.
	 *
	 * @param controller - The controller object that specifies the user interactivity.
	 */
	setController(controller: Controller): void {
		this._controller = controller;

		const canvas = this._canvasElement;
		if (!canvas) {
			return;
		}

		// eslint-disable-next-line @typescript-eslint/no-empty-function
		const noop = () => {};

		canvas.onclick = this._controller.onClick
			? (event: MouseEvent) => this._controller.onClick?.(this, event)
			: noop;
		canvas.ondrag = this._controller.onDrag
			? (event: MouseEvent) => this._controller.onDrag?.(this, event)
			: noop;
		canvas.onmousemove = this._controller.onMouseMove
			? (event: MouseEvent) => this._controller.onMouseMove?.(this, event)
			: noop;
		canvas.onmousedown = this._controller.onMouseDown
			? (event: MouseEvent) => this._controller.onMouseDown?.(this, event)
			: noop;
		canvas.onmouseup = this._controller.onMouseUp
			? (event: MouseEvent) => this._controller.onMouseUp?.(this, event)
			: noop;
		canvas.onwheel = this._controller.onWheel
			? (event: WheelEvent) => this._controller.onWheel?.(this, event)
			: noop;
	}

	/**
	 * Binds the keyboard shortcuts to the attached canvas (which must be focused).
	 * Two groups of keys:
	 *
	 * Controllers (how the mouse behaves):
	 *   o - Orbital camera controls
	 *   c - Add Cube controls
	 *   s - Select Object controls
	 *
	 * Scenes (what is being rendered):
	 *   1 - Snowman (procedural spheres)
	 *   2 - Stanford Bunny (loaded OBJ)
	 *   3 - Stanford Dragon (loaded OBJ)
	 */
	private bindKeyboard(): void {
		const canvas = this._canvasElement;
		if (!canvas) {
			return;
		}

		this._keydownHandler = (event: KeyboardEvent) => {
			switch (event.key) {
				case "c":
					this.setController(new AddCubeController());
					break;
				case "o":
					this.setController(new OrbitalControls());
					break;
				case "s":
					this.setController(new SelectObjectController());
					break;
				case "1":
					this.loadScene("snowman");
					break;
				case "2":
					this.loadScene("bunny");
					break;
				case "3":
					this.loadScene("dragon");
					break;
			}
		};
		canvas.addEventListener("keydown", this._keydownHandler);
	}

	/**
	 * Replaces the objects in the scene with a named test scene, clears the
	 * selection, and notifies observing panels. The renderer uploads the new
	 * objects' GPU resources on the next frame automatically.
	 *
	 * @param name - A key of SCENES ("snowman", "bunny", or "dragon").
	 */
	loadScene(name: keyof typeof SCENES): void {
		this._scene.objectList = SCENES[name]();
		this._selectedId = null;
		this.emit();
	}

	/**
	 * Runs every frame and renders the current scene to the canvas. No-op until a
	 * canvas is attached.
	 */
	render(): void {
		if (!this._renderer) {
			return;
		}
		this._scene.updateFunction();
		this._renderer.drawScene(this._scene);
	}
}

export { App };
