import { vec2, vec3, vec4, mat4 } from "gl-matrix";

import { VertexBuffer, IndexBuffer } from "./Buffer";
import { Material } from "./Material";
import { ShaderProgram } from "./Shader";
import { Texture } from "./Texture";
import { Camera } from "./Camera";

/**
 * Which graphics API a backend drives. Firefly ships two implementations of
 * the same `RenderBackend` interface - see `createBackend.ts` for how one is
 * chosen at runtime.
 */
export type BackendKind = "webgl2" | "webgpu";

/**
 * The number of point lights the lighting shaders declare. Every backend
 * clamps to this, and *every* shader that loops over lights must declare the
 * same number: `MAX_LIGHTS` in Shaders/Lighting.frag.glsl and the
 * `MAX_LIGHTS` const in Shaders/wgsl/Lighting.wgsl. Keep all three in step.
 */
export const MAX_LIGHTS = 10;

/**
 * One thing to draw this frame: a mesh (its GPU buffers) with a material and a
 * world transform, plus the id to write into the picking id-texture. The
 * RenderSystem builds these from the ECS world; a backend stays a pure GPU
 * driver that knows nothing about entities or the scene graph.
 */
export interface Renderable {
	id: number;
	transform: mat4;
	material: Material;
	vertexBuffer: VertexBuffer;
	indexBuffer: IndexBuffer;
}

/**
 * An offscreen surface a backend can render into instead of the canvas - what
 * the final-render panel draws through (see App.renderThroughCamera). Its GPU
 * internals are private to whichever backend created it; callers only ever
 * hold it and hand it back, so the shared shape is just the size.
 *
 * A target belongs to the backend that created it and must be deleted through
 * that same backend. `App.rendererGeneration` is what callers use to notice a
 * backend swap and drop a stale target rather than deleting it through the new
 * one - see RenderPanel.tsx.
 */
export interface RenderTarget {
	readonly width: number;
	readonly height: number;
}

/**
 * Everything the engine needs from a graphics API, and the seam that lets
 * Firefly render the same world through either WebGL2 or WebGPU.
 *
 * The contract is deliberately narrow and *stateless from the outside*: no
 * bind/unbind, no "set this uniform" - a caller hands over a list of
 * `Renderable`s and the lighting environment, and the backend decides how to
 * express that in its API. That's what keeps the two implementations honestly
 * interchangeable, since WebGL's global state machine and WebGPU's
 * pipeline/bind-group model have almost nothing in common at the call level.
 *
 * Two consequences worth knowing before implementing one:
 *
 * - **A backend owns its GPU handles, the asset objects do not.** A `Mesh`,
 *   `Texture`, or `ShaderProgram` is pure CPU-side data; each backend keeps
 *   its own cache from those objects to its own handles (see
 *   webgl/GLResourceCache.ts). This is why the same Mesh can be drawn by two
 *   backends without either corrupting the other's state.
 * - **Readback is asynchronous.** `pick` and `readTargetPixels` return
 *   promises even on WebGL, where the answer is available immediately. WebGPU
 *   can only map a buffer back to the CPU asynchronously, and one API that
 *   both backends satisfy honestly beats a synchronous one that only WebGL
 *   can keep.
 */
export interface RenderBackend {
	/** Which graphics API this backend drives - shown in the UI, and useful
	 * when something must branch on the API (ideally nothing above here does). */
	readonly kind: BackendKind;

	/** The pixel dimensions of the render surface, including the id-texture
	 * that `pick` reads. Mutated in place on `resize`, so holders of the
	 * reference keep seeing the current size. */
	readonly canvasSize: vec2;

	/** One-time setup: allocate the render surfaces and set whatever global
	 * state never changes frame to frame. Call once after construction,
	 * before the first draw. */
	initScene(backgroundColor: vec4): void;

	/** Sets the color the surface is cleared to at the start of a frame. */
	setClearColor(color: vec4): void;

	/** Resizes the render surface and all of its attachments to a new pixel
	 * size. The id-texture resizes with it, so picking stays aligned. */
	resize(width: number, height: number): void;

	/**
	 * Draws one frame to the canvas.
	 *
	 * @param renderables - What to draw, including editor-only things like the
	 * transform gizmo's handles, which are real depth-tested entities
	 * @param cam - The camera whose view/projection to render from
	 * @param ambientLight - The scene ambient light color
	 * @param lightPositions - World-space point light positions, clamped to
	 * MAX_LIGHTS
	 * @param outlineRenderables - Drawn after the main pass with front faces
	 * culled, so only the sliver poking past the real geometry shows as a
	 * silhouette rim (see Outline.ts)
	 */
	render(
		renderables: Renderable[],
		cam: Camera,
		ambientLight: vec3,
		lightPositions: vec3[],
		outlineRenderables?: Renderable[]
	): void;

	/**
	 * Reads back the object id drawn at a pixel, in id-texture space with the
	 * origin at the top-left (matching the DOM). Resolves to the id, or null
	 * when the pixel is background or the id could not be read.
	 *
	 * Samples the last frame that was drawn - it never triggers a re-render.
	 */
	pick(x: number, y: number): Promise<number | null>;

	/** Allocates an offscreen render target at the given pixel size. */
	createOffscreenTarget(width: number, height: number): RenderTarget;

	/** Resizes a target's attachments in place. A no-op if the size is
	 * unchanged, so callers can call it on every observed size. */
	resizeOffscreenTarget(
		target: RenderTarget,
		width: number,
		height: number
	): void;

	/** Renders into an offscreen target instead of the canvas. No outline or
	 * picking pass: this is meant to look like a shipped render. */
	renderToTarget(
		target: RenderTarget,
		renderables: Renderable[],
		cam: Camera,
		ambientLight: vec3,
		lightPositions: vec3[]
	): void;

	/** Reads a target's color image back into CPU memory as **RGBA8 with a
	 * top-left origin**, ready to wrap in an ImageData. Backends whose native
	 * readback differs (WebGL reads bottom-up) normalize to that here. */
	readTargetPixels(target: RenderTarget): Promise<Uint8Array>;

	/** Frees a target's GPU memory. */
	deleteOffscreenTarget(target: RenderTarget): void;

	/** Frees a vertex buffer's GPU memory (and any attribute state captured
	 * for it). Call when nothing references the mesh anymore. */
	deleteVertexBuffer(buffer: VertexBuffer): void;

	/** Frees an index buffer's GPU memory. */
	deleteIndexBuffer(buffer: IndexBuffer): void;

	/** Frees a texture's GPU memory. */
	deleteTexture(texture: Texture): void;

	/** Frees a compiled/linked shader program's GPU memory. */
	deleteShaderProgram(program: ShaderProgram): void;

	/** Releases everything this backend owns. Called when the canvas is
	 * detached; the backend is not reusable afterward. */
	dispose(): void;
}
