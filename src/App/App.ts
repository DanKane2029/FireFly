import { Renderer } from "../Renderer/Renderer";
import { Picker } from "../Renderer/Picker";
import { Camera } from "../Renderer/Camera";
import { Controller } from "../Controller/Controller";

// controllers
import { AddCubeController } from "../Controller/AddCube";
import { OrbitalControls } from "../Controller/OrbitalCamera";
import { GizmoController } from "../Controller/GizmoController";

import { mat4, vec2, vec3, vec4 } from "gl-matrix";

import { World } from "../ecs/World";
import { Scheduler } from "../ecs/System";
import { renderSystem } from "../ecs/systems/RenderSystem";
import { animationSystem } from "../ecs/systems/AnimationSystem";
import {
	spawnSnowman,
	spawnBunny,
	spawnDragon,
	spawnDefaultLights,
} from "../ecs/scenes";
import { litProgram, spawnRenderable } from "../ecs/prefabs";
import { MaterialRef } from "../ecs/components/MaterialRef";
import { Transform, transformMatrix } from "../ecs/components/Transform";
import { MeshRef } from "../ecs/components/MeshRef";
import { buildOutlineRenderable } from "../Renderer/Outline";
import { buildGizmoRenderables } from "../Renderer/Gizmo";
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
	private _controller: Controller;
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
		this._controller = new OrbitalControls();
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

		this.setController(this._controller);
		this.bindKeyboard();
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
		this._camera.aspectRatio = w / h;
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
	 *   s - Select/gizmo controls (click to select; drag a selected
	 *       object's axis handles to move it)
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
					this.setController(new GizmoController());
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

		// The gizmo isn't ECS data - it's an editor overlay tied to the
		// current selection, not a world entity - so it's built here rather
		// than inside renderSystem (see RenderContext.overlayRenderables).
		const selectedTransform =
			this._selectedId !== null
				? this._world.get(this._selectedId, Transform)
				: undefined;
		const overlayRenderables = selectedTransform
			? buildGizmoRenderables(
					selectedTransform.translation,
					this._camera.translation
			  )
			: undefined;

		// Same reasoning as the gizmo above: not ECS data, built here from the
		// current selection. Only entities with a mesh get one - a selected
		// light, for instance, has nothing to outline.
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
			overlayRenderables,
			outlineRenderables,
		});
	}
}

export { App };
