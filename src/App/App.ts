import { Renderer, OffscreenRenderTarget } from "../Renderer/Renderer";
import { Picker } from "../Renderer/Picker";
import { Camera } from "../Renderer/Camera";
import { Controller } from "../Controller/Controller";
import { OrbitalControls } from "../Controller/OrbitalCamera";
import {
	ToolId,
	DEFAULT_TOOL_ID,
	toolById,
	toolForKey,
} from "../Controller/tools";
import { GizmoController } from "../Controller/GizmoController";
import {
	GizmoMode,
	DEFAULT_GIZMO_MODE_ID,
	gizmoModeForKey,
} from "../Controller/gizmoModes";

import { mat4, vec2, vec3, vec4 } from "gl-matrix";

import { World, Entity } from "../ecs/World";
import { Scheduler } from "../ecs/System";
import {
	renderSystem,
	gatherRenderables,
	gatherLightPositions,
} from "../ecs/systems/RenderSystem";
import { animationSystem } from "../ecs/systems/AnimationSystem";
import {
	spawnSnowman,
	spawnBunny,
	spawnDragon,
	spawnDefaultLights,
} from "../ecs/scenes";
import { litProgram, spawnRenderable } from "../ecs/prefabs";
import { MaterialRef } from "../ecs/components/MaterialRef";
import {
	Transform,
	transformMatrix,
	transformFromMatrix,
	transformOrientation,
} from "../ecs/components/Transform";
import { CameraComponent } from "../ecs/components/Camera";
import { MeshRef } from "../ecs/components/MeshRef";
import { EditorOnly } from "../ecs/components/EditorOnly";
import { Transient } from "../ecs/components/Transient";
import { buildOutlineRenderable } from "../Renderer/Outline";
import { buildGizmoHandleSpecs } from "../Renderer/Gizmo";
import { GizmoHandle } from "../Renderer/GizmoAxis";
import { assetRegistry } from "../Assets/AssetRegistry";
import { AssetId } from "../Assets/AssetId";
import { ShaderProgram } from "../Renderer/Shader";
import { MaterialProperty, MaterialPropertyType } from "../Renderer/Material";
import { Texture } from "../Renderer/Texture";
import {
	Storage,
	StorageCapabilities,
	FileRef,
	WorkspaceRef,
	RecentWorkspaceEntry,
	DirectoryEntry,
} from "../platform/Storage";
import { shortContentHash } from "../platform/contentHash";
import { serializeScene } from "../Scene/serializeScene";
import { deserializeScene } from "../Scene/deserializeScene";
import { SceneFile } from "../Scene/SceneFile";
import { parseGLB } from "../Geometry/GLTFLoader";
import { decodeImage } from "../Geometry/decodeImage";

/** Shader programs a `.ffscene` material asset can reference, keyed by the
 * shader id the file stores. The scene format only knows shaders by id;
 * resolving that id to the actual compiled program is App's job, so the
 * Scene module itself never has to import prefabs.ts (which pulls in
 * webpack-only .glsl/.obj imports Jest can't transform - see the Scene
 * module's tests). */
const SHADER_PROGRAMS: Record<string, ShaderProgram> = { lit: litProgram };

const SCENE_FILE_EXTENSION = "ffscene";
const MODEL_FILE_EXTENSION = "glb";

/**
 * The selectable test scenes, each a function that populates the ECS world with
 * a set of entities. Switching scenes just clears the world and runs one of
 * these.
 */
const SCENES: Record<string, (world: World) => void> = {
	snowman: spawnSnowman,
	bunny: spawnBunny,
	dragon: spawnDragon,
};

/**
 * The persistent core of the application: it owns the ECS world (the entities),
 * the camera and lights, the system schedule, the active input controller, and a
 * small store of editor UI state (the current selection). It deliberately does
 * NOT own the canvas or WebGL context - those belong to whichever Scene panel is
 * currently displaying the world.
 *
 * This split is what lets the docking UI treat the 3D view as just another
 * panel: the App lives for the whole session, while the Scene panel calls
 * `attachCanvas` when it mounts and `detachCanvas` when it unmounts. The App
 * also exposes a tiny subscribe/getSnapshot store so React panels can observe
 * the world and selection via `useSyncExternalStore`.
 */
class App {
	private _world: World;
	private _camera: Camera;
	private _ambientLight: vec3;
	private _backgroundColor: vec4;
	// The camera is always-on and never swapped - see setTool's doc comment
	// for why camera and tools are split into two independent controllers
	// instead of one modal one.
	private _cameraController: OrbitalControls;
	private _toolController: Controller;
	private _activeToolId: ToolId;
	// Which of the gizmo's three drag behaviors is active - independent of
	// _activeToolId (the gizmo is only reachable through the "select" tool,
	// but which mode it's in survives switching to another tool and back;
	// see setTool's re-sync). Remembered here, not on the GizmoController
	// instance itself, since setTool constructs a fresh one on every switch.
	private _gizmoMode: GizmoMode;
	// The gizmo's handle entities (see syncGizmoEntities), and which
	// selection+mode they were last built for - rebuilt only when either
	// changes, not every frame (their Transforms alone are updated every
	// frame, since the gizmo's on-screen size tracks live camera distance).
	private _gizmoEntities: Entity[] = [];
	private _gizmoEntitiesFor: { selection: Entity; mode: GizmoMode } | null =
		null;
	private _storage: Storage;
	// The file the current scene was last saved to or opened from, or null for
	// an unsaved new scene. Reused so a second "Save" overwrites in place
	// instead of re-prompting (where the backend supports that - see
	// Storage.capabilities.overwriteInPlace).
	private _currentFileRef: FileRef | null;
	// The folder imported asset bytes are read from and written to. Nothing
	// reads or writes bytes yet (that starts with the glTF import milestone) -
	// opening a workspace right now just remembers which one, so opening it
	// again later shows up in recentWorkspaces().
	private _workspace: WorkspaceRef | null;

	// Per-frame simulation clock and the ordered list of update systems.
	private _scheduler: Scheduler;
	private _time: number;
	private _lastTime: number;

	// Set only while a Scene panel is displaying the world.
	private _renderer: Renderer | undefined;
	private _picker: Picker | undefined;
	private _canvasElement: HTMLCanvasElement | undefined;
	private _keydownHandler: ((event: KeyboardEvent) => void) | undefined;
	// Bumped every attach/detach - see rendererGeneration's doc comment.
	private _rendererGeneration = 0;

	// --- editor UI store (observed by React panels) ---
	private _selectedId: number | null;
	private _selectedMaterialId: AssetId | null;
	private _version: number;
	private _listeners: Set<() => void>;

	/**
	 * Creates the application and builds the initial world. No canvas or GL
	 * context is created here; call `attachCanvas` once a canvas exists.
	 *
	 * @param storage - Where scenes are saved to and opened from.
	 * `index.tsx` passes the real platform implementation (`createStorage()`);
	 * tests inject `MemoryStorage` instead, so the persistence layer needs no
	 * mocking (see docs/scene-creator-roadmap.md's storage-abstraction
	 * section).
	 */
	constructor(storage: Storage) {
		this._world = new World();
		// Aspect ratio is a placeholder until a canvas is attached / resized.
		this._camera = new Camera(1, 45, 0.01, 1000);
		this._ambientLight = vec3.fromValues(0.1, 0.1, 0.1);
		this._backgroundColor = [0.2, 0.2, 0.2, 1.0];
		this._cameraController = new OrbitalControls();
		this._activeToolId = DEFAULT_TOOL_ID;
		this._toolController = toolById(DEFAULT_TOOL_ID).create();
		this._gizmoMode = DEFAULT_GIZMO_MODE_ID;
		this._storage = storage;
		this._currentFileRef = null;
		this._workspace = null;

		// Update systems run in order each frame (movement/animation before the
		// render). RenderSystem is run separately since it needs GPU resources.
		this._scheduler = new Scheduler().add(animationSystem);
		this._time = 0;
		this._lastTime = 0;

		this._selectedId = null;
		this._selectedMaterialId = null;
		this._version = 0;
		this._listeners = new Set();

		this.buildWorld();
	}

	/**
	 * Sets up the lights, camera, and starting scene. Runs once at construction;
	 * needs no renderer.
	 */
	private buildWorld(): void {
		this._camera.translation = [0, 0, 2];
		this._camera.lookAt([0, 0, 0]);

		// Start on the snowman scene; press 2 / 3 to switch to the bunny / dragon.
		// loadScene spawns the lights along with the scene's entities.
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

		this._camera.aspectRatio = canvas.width / canvas.height;
		this._renderer.initScene(this._backgroundColor);

		// Reset the clock so the first frame's delta isn't the whole time the
		// panel was detached.
		this._lastTime = performance.now();

		this.bindInputHandlers();
		this.bindKeyboard();
		this._rendererGeneration++;
		// Notifies observers like the Render panel, whose empty state depends
		// on isAttached - without this, closing/reopening the Scene panel
		// wouldn't re-render anything watching that (see detachCanvas below).
		this.emit();
	}

	/**
	 * Detaches the current canvas, removing input handlers and dropping the
	 * renderer/picker. The world is left untouched so it survives the panel being
	 * closed and reopened. Called when the Scene panel unmounts.
	 */
	detachCanvas(): void {
		if (this._canvasElement) {
			this._canvasElement.onclick = null;
			this._canvasElement.ondrag = null;
			this._canvasElement.onmousemove = null;
			this._canvasElement.onmousedown = null;
			this._canvasElement.onmouseup = null;
			this._canvasElement.onwheel = null;
			this._canvasElement.oncontextmenu = null;
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
		this._rendererGeneration++;
		this.emit();
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
		this._camera.aspectRatio = w / h;
	}

	// --- final render (through a scene camera entity) -----------------------

	/**
	 * Creates an offscreen render target for the Render panel, backed by the
	 * same WebGL context as the interactive Scene view (see
	 * OffscreenRenderTarget's doc comment for why a second context isn't an
	 * option). Returns null if no Scene panel is currently attached - there is
	 * no context yet to render with.
	 */
	createRenderTarget(width: number, height: number): OffscreenRenderTarget | null {
		if (!this._renderer) {
			return null;
		}
		return this._renderer.createOffscreenTarget(width, height);
	}

	/**
	 * Resizes a render target created by `createRenderTarget`. No-op if no
	 * Scene panel is attached.
	 */
	resizeRenderTarget(
		target: OffscreenRenderTarget,
		width: number,
		height: number
	): void {
		if (!this._renderer) {
			return;
		}
		this._renderer.resizeOffscreenTarget(target, width, height);
	}

	/**
	 * Renders the world through a camera entity into a render target and reads
	 * the pixels back - the Render panel's "final" view, which (unlike the
	 * interactive Scene view) excludes editor-only visual aids like gizmo
	 * handles and camera icons (see gatherRenderables's excludeEditorOnly).
	 *
	 * Builds a fresh Renderer/Camera each call from the entity's Transform +
	 * CameraComponent rather than keeping one around - cheap (Camera is a
	 * plain data/math object, no GPU resources of its own - see Camera.ts) and
	 * it means a camera entity dragged or rotated via the gizmo is reflected
	 * immediately, with no separate sync step to keep in mind.
	 *
	 * Returns null if no Scene panel is attached, or if `cameraEntity` isn't
	 * (or is no longer - e.g. it was deleted) a camera.
	 */
	renderThroughCamera(
		target: OffscreenRenderTarget,
		cameraEntity: Entity
	): { pixels: Uint8Array; width: number; height: number } | null {
		if (!this._renderer) {
			return null;
		}
		const transform = this._world.get(cameraEntity, Transform);
		const cameraData = this._world.get(cameraEntity, CameraComponent);
		if (!transform || !cameraData) {
			return null;
		}

		const camera = new Camera(
			target.width / target.height,
			cameraData.fov,
			cameraData.near,
			cameraData.far
		);
		camera.translation = transform.translation;
		camera.orientation = transformOrientation(transform);

		const renderables = gatherRenderables(this._world, {
			excludeEditorOnly: true,
		});
		const lightPositions = gatherLightPositions(this._world);

		this._renderer.renderToTarget(
			target,
			renderables,
			camera,
			this._ambientLight,
			lightPositions
		);
		const pixels = this._renderer.readTargetPixels(target);

		return { pixels, width: target.width, height: target.height };
	}

	/**
	 * Deletes a render target created by `createRenderTarget`. No-op if no
	 * Scene panel is attached.
	 */
	deleteRenderTarget(target: OffscreenRenderTarget): void {
		if (!this._renderer) {
			return;
		}
		this._renderer.deleteOffscreenTarget(target);
	}

	/**
	 * Gets the camera used to view the world (orbital controls act on it).
	 */
	get camera(): Camera {
		return this._camera;
	}

	/**
	 * Gets the ECS world holding the scene's entities. Panels query this to list
	 * and edit objects.
	 */
	get world(): World {
		return this._world;
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

	/**
	 * Bumped every time a Scene panel attaches or detaches its canvas - and
	 * therefore creates or destroys the WebGL context (see attachCanvas: it
	 * always calls `canvas.getContext("webgl2", ...)` fresh, never reuses one).
	 * A render target from a previous generation (see createRenderTarget) holds
	 * GPU resource handles that belong to a context which may no longer exist;
	 * the Render panel compares this against the generation it created its
	 * target under to know when to throw the old one away and make a new one,
	 * rather than issuing GL calls against the current context with a handle
	 * from a different, possibly-destroyed one.
	 */
	get rendererGeneration(): number {
		return this._rendererGeneration;
	}

	/**
	 * The active storage backend's capabilities - e.g. whether a "Save" click
	 * can overwrite the open file in place, or has to become a "Download"
	 * (see Storage.ts). The File menu reads this instead of branching on
	 * platform directly.
	 */
	get storageCapabilities(): StorageCapabilities {
		return this._storage.capabilities;
	}

	/** The name of the file the current scene was last saved to or opened
	 * from, or null for an unsaved new scene. */
	get currentFileName(): string | null {
		return this._currentFileRef?.name ?? null;
	}

	/** The name of the currently open workspace, or null if none is open. */
	get currentWorkspaceName(): string | null {
		return this._workspace?.name ?? null;
	}

	/**
	 * Opens a workspace: on a backend with `capabilities.pickFolders`, prompts
	 * the user to pick a folder; otherwise resolves to the one implicit
	 * workspace that backend has. No-op if the user cancels a folder picker.
	 */
	async openWorkspace(): Promise<void> {
		const ref = await this._storage.openWorkspace();
		if (!ref) {
			return; // user cancelled
		}
		this._workspace = ref;
		this.emit();
	}

	/**
	 * Switches to a previously opened workspace without prompting a picker -
	 * the Storage backend resolves it (from its own in-memory cache, or, for
	 * FileSystemAccessStorage, from IndexedDB) the next time something
	 * actually reads or writes bytes.
	 *
	 * @param workspace - An entry from recentWorkspaces()
	 */
	openRecentWorkspace(workspace: WorkspaceRef): void {
		this._workspace = workspace;
		this.emit();
	}

	/** Previously opened workspaces, most recently opened first. */
	recentWorkspaces(): Promise<RecentWorkspaceEntry[]> {
		return this._storage.recentWorkspaces();
	}

	/**
	 * Lists the direct children of a workspace-relative directory, for the
	 * Workspace panel. `relativePath: ""` lists the open workspace's root.
	 * Resolves to `[]` if no workspace is open - App is the sole façade
	 * panels talk to, so this stays a thin pass-through to Storage rather
	 * than the panel importing a backend directly.
	 */
	listWorkspaceDirectory(relativePath: string): Promise<DirectoryEntry[]> {
		if (!this._workspace) {
			return Promise.resolve([]);
		}
		return this._storage.listDirectory(this._workspace, relativePath);
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
	 * Selects an entity by id (or clears the selection with null).
	 *
	 * @param id - The entity id to select, or null for no selection
	 */
	select(id: number | null): void {
		if (id !== this._selectedId) {
			this._selectedId = id;
			this.emit();
		}
	}

	/**
	 * The id of the material currently selected in the Materials panel, or
	 * null if none is. Independent of `selectedId` (an entity) - a material
	 * can be selected for editing without any object in the scene being
	 * selected, since materials are their own shared assets now.
	 */
	get selectedMaterialId(): AssetId | null {
		return this._selectedMaterialId;
	}

	/** Selects a material by id (or clears the selection with null). */
	selectMaterial(id: AssetId | null): void {
		if (id !== this._selectedMaterialId) {
			this._selectedMaterialId = id;
			this.emit();
		}
	}

	/** How many entities in the world reference a material - the Materials
	 * panel uses this to disable deleting a material still in use (deleting
	 * it would leave those entities' MaterialRef pointing at nothing). */
	materialUsageCount(id: AssetId): number {
		return this._world
			.query(MaterialRef)
			.filter(([, materialRef]) => materialRef.material === id).length;
	}

	// --- input ---------------------------------------------------------------

	/**
	 * The currently active tool - what the left mouse button does. The camera
	 * (right mouse button, always on) isn't a tool and has no id; see
	 * `setTool`.
	 */
	get activeToolId(): ToolId {
		return this._activeToolId;
	}

	/**
	 * Switches the active tool. Camera orbit/zoom keeps working no matter what
	 * this is set to - see `bindInputHandlers` - so this only changes what the
	 * left mouse button does.
	 *
	 * @param id - The tool to switch to, from the registry in Controller/tools.ts
	 */
	setTool(id: ToolId): void {
		this._activeToolId = id;
		const controller = toolById(id).create();
		// A fresh GizmoController always starts in its own default mode -
		// re-sync it to whatever mode was last active, so switching away to
		// another tool and back doesn't silently reset it to translate.
		if (controller instanceof GizmoController) {
			controller.setMode(this._gizmoMode);
		}
		this._toolController = controller;
		this.emit();
	}

	/**
	 * The gizmo's currently active drag mode (move/rotate/scale). Only
	 * meaningful while the "select" tool is active, but remembered regardless
	 * - see the field's own doc comment.
	 */
	get activeGizmoModeId(): GizmoMode {
		return this._gizmoMode;
	}

	/**
	 * Switches the gizmo's drag mode. Forwards to the active tool controller
	 * if it's currently a GizmoController (a no-op otherwise - e.g. while the
	 * "addCube" tool is active - the mode is still remembered for next time
	 * the select tool activates, via setTool's re-sync).
	 *
	 * @param mode - The mode to switch to, from the registry in
	 * Controller/gizmoModes.ts
	 */
	setGizmoMode(mode: GizmoMode): void {
		this._gizmoMode = mode;
		if (this._toolController instanceof GizmoController) {
			this._toolController.setMode(mode);
		}
		this.emit();
	}

	/**
	 * Wires the canvas's mouse events. Called once when a canvas attaches, not
	 * on every tool switch: each handler closes over `this` and reads
	 * `this._toolController` fresh on every event, so swapping the tool in
	 * `setTool` takes effect immediately without re-wiring anything here.
	 *
	 * Camera and tool are two independent controllers, not one modal one, so
	 * that orbiting/zooming the camera never has to fight for control with
	 * whatever tool is selected - see OrbitalControls' doc comment for how the
	 * two stay out of each other's way (right button vs. left button). Mouse
	 * move/down/up go to both; wheel is camera-only and click/drag are
	 * tool-only, since only the camera uses the wheel and only tools use
	 * click/drag today.
	 */
	private bindInputHandlers(): void {
		const canvas = this._canvasElement;
		if (!canvas) {
			return;
		}

		canvas.onmousedown = (event: MouseEvent) => {
			this._cameraController.onMouseDown?.(this, event);
			this._toolController.onMouseDown?.(this, event);
		};
		canvas.onmousemove = (event: MouseEvent) => {
			this._cameraController.onMouseMove?.(this, event);
			this._toolController.onMouseMove?.(this, event);
		};
		canvas.onmouseup = (event: MouseEvent) => {
			this._cameraController.onMouseUp?.(this, event);
			this._toolController.onMouseUp?.(this, event);
		};
		canvas.onwheel = (event: WheelEvent) =>
			this._cameraController.onWheel?.(this, event);
		canvas.onclick = (event: MouseEvent) =>
			this._toolController.onClick?.(this, event);
		canvas.ondrag = (event: MouseEvent) =>
			this._toolController.onDrag?.(this, event);
		// A right-button drag orbits the camera; without this the browser's
		// context menu would pop up on every mouse-up.
		canvas.oncontextmenu = (event: MouseEvent) => event.preventDefault();
	}

	/**
	 * Binds the keyboard shortcuts to the attached canvas (which must be focused).
	 * Three groups of keys:
	 *
	 * Tools (what the left mouse button does - see Controller/tools.ts for the
	 * source of truth; the ScenePanel's toolbar reads the same list):
	 *   s - Select/gizmo (click to select; drag a selected object's axis
	 *       handles to move, rotate, or scale it, depending on the mode below)
	 *   c - Add Cube (click to add a cube; drag to size it)
	 *
	 * Gizmo modes (which drag behavior the select tool's handles perform -
	 * see Controller/gizmoModes.ts; only checked while "select" is active,
	 * since w/e/r otherwise have no effect):
	 *   w - Move
	 *   e - Rotate
	 *   r - Scale
	 *
	 * The camera (orbit: right-button drag, zoom: scroll) is always on and has
	 * no key of its own - see `bindInputHandlers`.
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
			const tool = toolForKey(event.key);
			if (tool) {
				this.setTool(tool.id);
				return;
			}

			if (this._activeToolId === "select") {
				const mode = gizmoModeForKey(event.key);
				if (mode) {
					this.setGizmoMode(mode.id);
					return;
				}
			}

			switch (event.key) {
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
	 * Clears the world and repopulates it with a named test scene, clears the
	 * selection, and notifies observing panels. The renderer uploads the new
	 * entities' GPU resources on the next frame automatically.
	 *
	 * Materials are NOT disposed here, even though every entity referencing
	 * one is about to be destroyed: they're shared, permanent registry
	 * entries now (see AssetRegistry.listMaterials/MaterialsPanel), the same
	 * way built-in meshes already are - disposing a material because the
	 * scene using it was cleared would break every OTHER entity, in any
	 * other scene, that still references it.
	 *
	 * @param name - A key of SCENES ("snowman", "bunny", or "dragon").
	 */
	loadScene(name: keyof typeof SCENES): void {
		this._world.clear();
		// Lights are entities too, so clearing the world unlights it - every scene
		// spawns the shared rig before its own contents.
		spawnDefaultLights(this._world);
		SCENES[name](this._world);
		this._currentFileRef = null;
		this._selectedId = null;
		this.emit();
	}

	// --- scene files -----------------------------------------------------

	/**
	 * Starts a brand-new, empty scene: just the default light rig and camera,
	 * no file reference. Without the light rig this would be a black screen -
	 * see the roadmap's "File -> New must produce a template document
	 * containing a camera and a light" requirement.
	 */
	newScene(): void {
		this._world.clear();
		spawnDefaultLights(this._world);
		this._camera.translation = vec3.fromValues(0, 0, 2);
		this._camera.lookAt([0, 0, 0]);
		this._ambientLight = vec3.fromValues(0.1, 0.1, 0.1);
		this._backgroundColor = [0.2, 0.2, 0.2, 1.0];
		this._currentFileRef = null;
		this._selectedId = null;
		this.emit();
	}

	/**
	 * Saves the current scene. Reuses the file it was last saved to or opened
	 * from when the backend supports overwriting in place; otherwise (or on
	 * the very first save) prompts for where to save, same as `saveSceneAs`.
	 * No-op if the user cancels the prompt.
	 */
	async saveScene(): Promise<void> {
		if (
			this._currentFileRef &&
			this._storage.capabilities.overwriteInPlace
		) {
			await this.writeSceneTo(this._currentFileRef);
			return;
		}
		await this.saveSceneAs();
	}

	/** Always prompts for where to save, even if the scene already has a file. */
	async saveSceneAs(): Promise<void> {
		const ref = await this._storage.pickSaveFile({
			suggestedName:
				this._currentFileRef?.name ?? `scene.${SCENE_FILE_EXTENSION}`,
			extensions: [SCENE_FILE_EXTENSION],
		});
		if (!ref) {
			return; // user cancelled
		}
		await this.writeSceneTo(ref);
	}

	private async writeSceneTo(ref: FileRef): Promise<void> {
		const file = serializeScene(this._world, assetRegistry, this._camera, {
			ambientLight: this._ambientLight,
			backgroundColor: this._backgroundColor,
		});
		await this._storage.writeText(ref, JSON.stringify(file, null, "\t"));
		this._currentFileRef = ref;
		this.emit();
	}

	/**
	 * Prompts the user to pick a `.ffscene` file and replaces the current
	 * scene with it - camera and lighting included. No-op if the user
	 * cancels the prompt.
	 */
	async openScene(): Promise<void> {
		const ref = await this._storage.pickOpenFile({
			extensions: [SCENE_FILE_EXTENSION],
		});
		if (!ref) {
			return; // user cancelled
		}

		const text = await this._storage.readText(ref);
		const file = JSON.parse(text) as SceneFile;

		this._world.clear();

		const environment = deserializeScene(
			file,
			this._world,
			assetRegistry,
			this._camera,
			SHADER_PROGRAMS
		);
		this._ambientLight = environment.ambientLight;
		this._backgroundColor = environment.backgroundColor;
		if (this._renderer) {
			this._renderer.setClearColor(this._backgroundColor);
		}

		this._currentFileRef = ref;
		this._selectedId = null;
		this.emit();
	}

	// --- model import ------------------------------------------------------

	/**
	 * Imports a `.glb` file: parses it (GLTFLoader.ts), decodes any texture it
	 * references (decodeImage.ts - the DOM-dependent half GLTFLoader itself
	 * never touches), copies its bytes into the current workspace under a
	 * content-hashed name (opening one first if none is open - re-importing
	 * the exact same file dedupes to the same asset id rather than piling up
	 * duplicates), registers its meshes and materials, and spawns one entity
	 * per mesh-bearing node at its flattened world transform (glTF nodes are
	 * a hierarchy; the ECS is flat - see GLTFLoader's node-flattening).
	 *
	 * No-op if the user cancels either the file picker or - for a backend
	 * that has to prompt one - the workspace picker.
	 */
	async importModel(): Promise<void> {
		const ref = await this._storage.pickOpenFile({
			extensions: [MODEL_FILE_EXTENSION],
		});
		if (!ref) {
			return; // user cancelled
		}

		const bytes = await this._storage.readFileBytes(ref);
		const parsed = parseGLB(bytes);

		if (!this._workspace) {
			await this.openWorkspace();
		}
		if (!this._workspace) {
			return; // user cancelled the workspace picker - nowhere to put the asset
		}
		const workspace = this._workspace;

		const hash = await shortContentHash(bytes);
		const uri = `assets/${hash}-${ref.name}`;
		await this._storage.writeBytes(workspace, uri, bytes);

		// Decode every referenced image once, up front.
		const textures = new Map<number, Texture>();
		for (const [imageIndex, image] of parsed.images) {
			textures.set(
				imageIndex,
				await decodeImage(image.bytes, image.mimeType)
			);
		}

		// Register a material per glTF material actually used.
		const materialIds = new Map<number, AssetId>();
		parsed.materials.forEach((material, materialIndex) => {
			const properties: MaterialProperty[] = [
				{
					type: MaterialPropertyType.VEC4,
					name: "u_color",
					value: material.baseColorFactor,
				},
			];
			const texture =
				material.baseColorTextureImageIndex !== null
					? textures.get(material.baseColorTextureImageIndex)
					: undefined;
			if (texture) {
				properties.push({
					type: MaterialPropertyType.TEXTURE,
					name: "u_texture",
					value: texture,
				});
			}
			materialIds.set(
				materialIndex,
				assetRegistry.createMaterial(
					material.name ?? "Imported Material",
					litProgram,
					properties
				)
			);
		});

		// Register (or reuse, if this exact mesh was already imported - see
		// AssetRegistry.hasMesh) each primitive's mesh, then spawn one entity
		// per mesh-bearing node.
		parsed.nodeInstances.forEach((instance, nodeOrder) => {
			instance.primitives.forEach((primitive, primitiveIndex) => {
				const meshId = `gltf/${uri}#${instance.meshIndex}.${primitiveIndex}`;
				if (!assetRegistry.hasMesh(meshId)) {
					assetRegistry.registerMesh(
						meshId,
						{
							kind: "gltf",
							uri,
							meshIndex: instance.meshIndex,
							primitiveIndex,
						},
						primitive.mesh
					);
				}

				const materialId =
					primitive.materialIndex !== null
						? materialIds.get(primitive.materialIndex)
						: undefined;
				// glTF's own default (used when a primitive has no material at
				// all): opaque white, no texture.
				const finalMaterialId =
					materialId ??
					assetRegistry.createMaterial(
						"Default Material",
						litProgram,
						[
							{
								type: MaterialPropertyType.VEC4,
								name: "u_color",
								value: [1, 1, 1, 1],
							},
						]
					);

				spawnRenderable(this._world, {
					mesh: meshId,
					material: finalMaterialId,
					name: instance.name ?? `Imported mesh ${nodeOrder + 1}`,
					transform: instance.transform,
				});
			});
		});

		this.emit();
	}

	/**
	 * Runs every frame: advances the update systems by the elapsed time, then the
	 * render system draws the world's entities to the canvas. No-op until a canvas
	 * is attached.
	 */
	render(): void {
		if (!this._renderer) {
			return;
		}

		// Real elapsed seconds since the last frame, clamped so a background tab
		// or a hitch doesn't produce a huge jump.
		const now = performance.now();
		const dt = Math.min((now - this._lastTime) / 1000, 0.1);
		this._lastTime = now;
		this._time += dt;

		this._scheduler.run(this._world, dt, this._time);

		// Gizmo handles are real entities now (Transform + MeshRef +
		// MaterialRef, tagged EditorOnly + Transient + GizmoHandle - see
		// GizmoAxis.ts/Gizmo.ts) so they draw depth-tested through the normal
		// pass below like anything else, instead of a separate always-on-top
		// overlay pass. Synced here, before renderSystem runs, so its query
		// picks up this frame's fresh transforms.
		this.syncGizmoEntities();

		// The outline isn't ECS data - it's an editor overlay tied to the
		// current selection, not a world entity - so it's built here rather
		// than inside renderSystem (see RenderContext.outlineRenderables).
		// Only entities with a mesh get one - a selected light, for instance,
		// has nothing to outline.
		const selectedTransform =
			this._selectedId !== null
				? this._world.get(this._selectedId, Transform)
				: undefined;
		const selectedMeshRef =
			this._selectedId !== null
				? this._world.get(this._selectedId, MeshRef)
				: undefined;
		const outlineRenderables =
			selectedTransform && selectedMeshRef
				? [
						buildOutlineRenderable(
							this._selectedId as number,
							transformMatrix(selectedTransform, mat4.create()),
							assetRegistry.resolveMesh(selectedMeshRef.mesh)
						),
				  ]
				: undefined;

		renderSystem(this._world, {
			renderer: this._renderer,
			camera: this._camera,
			ambientLight: this._ambientLight,
			outlineRenderables,
		});
	}

	/**
	 * Keeps the gizmo's handle entities in sync with the current selection
	 * and mode. Destroys and respawns them only when the selection or mode
	 * actually changes (mode-switching or re-selecting is infrequent); their
	 * Transforms are recomputed and rewritten every single frame regardless,
	 * since the gizmo's on-screen size tracks live camera distance.
	 */
	private syncGizmoEntities(): void {
		const selectedTransform =
			this._selectedId !== null
				? this._world.get(this._selectedId, Transform)
				: undefined;

		if (!selectedTransform) {
			this.destroyGizmoEntities();
			return;
		}

		const selection = this._selectedId as number;
		const specs = buildGizmoHandleSpecs(
			this._gizmoMode,
			selectedTransform.translation,
			this._camera.translation
		);

		const needsRebuild =
			!this._gizmoEntitiesFor ||
			this._gizmoEntitiesFor.selection !== selection ||
			this._gizmoEntitiesFor.mode !== this._gizmoMode ||
			this._gizmoEntities.length !== specs.length;

		if (needsRebuild) {
			this.destroyGizmoEntities();
			this._gizmoEntities = specs.map((spec) => {
				const entity = this._world.create();
				this._world.add(
					entity,
					Transform,
					transformFromMatrix(spec.transform)
				);
				this._world.add(entity, MeshRef, { mesh: spec.mesh });
				this._world.add(entity, MaterialRef, {
					material: spec.material,
				});
				this._world.add(entity, EditorOnly, {});
				this._world.add(entity, Transient, {});
				this._world.add(entity, GizmoHandle, { axis: spec.axis });
				return entity;
			});
			this._gizmoEntitiesFor = { selection, mode: this._gizmoMode };
			return;
		}

		specs.forEach((spec, i) => {
			this._world.add(
				this._gizmoEntities[i],
				Transform,
				transformFromMatrix(spec.transform)
			);
		});
	}

	private destroyGizmoEntities(): void {
		this._gizmoEntities.forEach((entity) => this._world.destroy(entity));
		this._gizmoEntities = [];
		this._gizmoEntitiesFor = null;
	}
}

export { App };
