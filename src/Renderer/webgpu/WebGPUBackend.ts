import { mat3, mat4, vec2, vec3, vec4 } from "gl-matrix";

import { VertexBuffer, IndexBuffer } from "../Buffer";
import { ShaderProgram } from "../Shader";
import { Texture } from "../Texture";
import { MaterialProperty, MaterialPropertyType } from "../Material";
import { Camera } from "../Camera";
import {
	BackendKind,
	RenderBackend,
	RenderTarget,
	Renderable,
} from "../RenderBackend";
import { GPUResourceCache } from "./GPUResourceCache";
import {
	DEPTH_TEXTURE_FORMAT,
	ID_TEXTURE_FORMAT,
	PipelineCache,
	PipelineKey,
} from "./PipelineCache";
import {
	DRAW_SIZE,
	FRAME_SIZE,
	drawStride,
	writeDrawUniforms,
	writeFrameUniforms,
} from "./UniformLayout";

/** The color format offscreen targets use. Deliberately `rgba8unorm` rather
 * than the canvas's preferred format (usually `bgra8unorm`): the Render panel
 * hands the readback straight to an `ImageData`, which is RGBA, so choosing
 * the format here saves swizzling every pixel on the CPU later. */
const OFFSCREEN_COLOR_FORMAT: GPUTextureFormat = "rgba8unorm";

/** `copyTextureToBuffer` requires each row of the destination to start on a
 * 256-byte boundary. Both readback paths pad to this and strip the padding
 * afterward. */
const BYTES_PER_ROW_ALIGNMENT = 256;

/**
 * Converts a gl-matrix projection matrix into WebGPU's clip space.
 *
 * This is the single most likely thing to go wrong when the same camera code
 * feeds both APIs. OpenGL's normalized device coordinates run z from -1 at the
 * near plane to +1 at the far plane, and `mat4.perspective` produces exactly
 * that. **WebGPU's run from 0 to 1.** Handing a GL projection to WebGPU
 * unchanged means every fragment in the near half of the view volume lands at
 * z < 0 and is clipped away - the scene renders with its front half missing,
 * which reads like a broken near plane rather than a coordinate convention.
 *
 * Left-multiplying by this matrix rescales z from [-1,1] to [0,1] and leaves
 * x and y alone.
 */
const CLIP_SPACE_CORRECTION: mat4 = mat4.fromValues(
	1, 0, 0, 0,
	0, 1, 0, 0,
	0, 0, 0.5, 0,
	0, 0, 0.5, 1
);

/** An offscreen target: the same three attachments the canvas pass uses. The
 * id target is carried even though nothing picks against a final render,
 * because every Firefly fragment shader writes an id - and a WebGPU pipeline
 * must declare a target for every fragment output its shader has, so dropping
 * it would mean a second set of shaders. One spare texture is cheaper than
 * that. */
interface GPURenderTargetImpl extends RenderTarget {
	colorTexture: GPUTexture;
	idTexture: GPUTexture;
	depthTexture: GPUTexture;
	width: number;
	height: number;
}

/**
 * Renders a list of renderables through WebGPU.
 *
 * Reading this next to webgl/WebGLBackend.ts is the point: both satisfy the
 * same `RenderBackend` interface and draw the same world, but almost nothing
 * about how they get there is shared.
 *
 *   - **State is immutable, and decided up front.** Cull mode, blending, depth
 *     behavior and target formats are compiled into pipeline objects
 *     (PipelineCache.ts) instead of being poked between draws.
 *   - **Uniforms are just bytes.** There is no `uniform3fv`; per-frame and
 *     per-draw values are packed into buffers whose layout the shader and
 *     UniformLayout.ts have to agree on exactly.
 *   - **Work is recorded, then submitted.** Draw calls go into a command
 *     encoder and reach the GPU in one submit at the end of the frame.
 *   - **Nothing is copied to the canvas.** The canvas texture is a color
 *     attachment of the main pass directly, so WebGL's blitFramebuffer step
 *     has no counterpart here.
 */
class WebGPUBackend implements RenderBackend {
	readonly kind: BackendKind = "webgpu";

	private _device: GPUDevice;
	private _context: GPUCanvasContext;
	private _canvasFormat: GPUTextureFormat;
	private _canvasSize: vec2;
	private _clearColor: vec4 = [0, 0, 0, 1];

	private _resources = new GPUResourceCache();
	private _pipelines: PipelineCache;

	// Per-frame and per-draw uniform storage. Each is a GPU buffer plus the
	// CPU-side bytes staged into it once per frame (see writeFrameUniforms /
	// writeDrawUniforms).
	private _frameBuffer: GPUBuffer;
	private _frameStaging = new ArrayBuffer(FRAME_SIZE);
	private _frameBindGroup: GPUBindGroup;
	private _drawBuffer!: GPUBuffer;
	private _drawStaging!: ArrayBuffer;
	private _drawBindGroup!: GPUBindGroup;
	private _drawLayout: GPUBindGroupLayout;
	private _drawCapacity = 0;
	private _drawStride: number;

	private _materialLayout: GPUBindGroupLayout;
	private _sampler: GPUSampler;
	// A 1x1 white texture bound whenever a material has no texture of its own,
	// so the shader's albedo multiply is a no-op instead of needing a branch -
	// the same trick the WebGL backend uses.
	private _defaultTexture: Texture;

	// The canvas pass's non-canvas attachments. Recreated on resize, since a
	// GPU texture's size is fixed at creation.
	private _idTexture: GPUTexture | undefined;
	private _depthTexture: GPUTexture | undefined;
	// Destination for pick()'s single-pixel readback. 256 bytes because that
	// is the minimum row pitch copyTextureToBuffer accepts.
	private _pickBuffer: GPUBuffer;
	// Picks are serialized through this chain: a GPUBuffer cannot be mapped
	// while an earlier mapAsync on it is still pending, and clicks can easily
	// arrive faster than a readback completes.
	private _pickQueue: Promise<unknown> = Promise.resolve();

	private _disposed = false;

	/**
	 * Acquires a GPU device for a canvas and builds a backend around it.
	 *
	 * Asynchronous all the way down - `requestAdapter` and `requestDevice`
	 * both return promises, which is why `App.attachCanvas` is async too.
	 * Returns null (rather than throwing) when WebGPU is simply unavailable,
	 * so `createBackend` can fall back to WebGL without treating a perfectly
	 * ordinary browser as an error.
	 *
	 * @param canvas - The canvas to render into. A canvas can only ever have
	 * one context type, so this canvas must never have had a WebGL context.
	 */
	static async create(
		canvas: HTMLCanvasElement
	): Promise<WebGPUBackend | null> {
		if (!navigator.gpu) {
			return null;
		}

		const adapter = await navigator.gpu.requestAdapter();
		if (!adapter) {
			return null;
		}

		let device: GPUDevice;
		try {
			device = await adapter.requestDevice();
		} catch {
			return null;
		}

		const context = canvas.getContext("webgpu");
		if (!context) {
			device.destroy();
			return null;
		}

		const format = navigator.gpu.getPreferredCanvasFormat();
		context.configure({ device, format, alphaMode: "opaque" });

		return new WebGPUBackend(
			device,
			context,
			format,
			vec2.fromValues(canvas.width, canvas.height)
		);
	}

	/**
	 * Takes an already-acquired device rather than acquiring one itself, since
	 * acquisition is asynchronous and a constructor cannot be. Use `create`.
	 */
	private constructor(
		device: GPUDevice,
		context: GPUCanvasContext,
		canvasFormat: GPUTextureFormat,
		size: vec2
	) {
		this._device = device;
		this._context = context;
		this._canvasFormat = canvasFormat;
		this._canvasSize = size;
		this._drawStride = drawStride(
			device.limits.minUniformBufferOffsetAlignment
		);

		// Three bind groups, in order of how often they change: once a frame,
		// once a draw, once a material. Grouping by update frequency is the
		// convention WebGPU is designed around - the driver can leave slower
		// groups bound while faster ones churn.
		const frameLayout = device.createBindGroupLayout({
			label: "firefly frame uniforms",
			entries: [
				{
					binding: 0,
					visibility:
						GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
					buffer: { type: "uniform" },
				},
			],
		});
		const drawLayout = device.createBindGroupLayout({
			label: "firefly draw uniforms",
			entries: [
				{
					binding: 0,
					visibility:
						GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
					// One buffer holds every draw's struct; each draw binds it
					// at its own offset rather than owning a buffer.
					buffer: { type: "uniform", hasDynamicOffset: true },
				},
			],
		});
		this._materialLayout = device.createBindGroupLayout({
			label: "firefly material",
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.FRAGMENT,
					texture: { sampleType: "float" },
				},
				{
					binding: 1,
					visibility: GPUShaderStage.FRAGMENT,
					sampler: { type: "filtering" },
				},
			],
		});

		const pipelineLayout = device.createPipelineLayout({
			bindGroupLayouts: [frameLayout, drawLayout, this._materialLayout],
		});
		this._pipelines = new PipelineCache(
			device,
			pipelineLayout,
			this._resources
		);

		this._frameBuffer = device.createBuffer({
			label: "firefly frame uniforms",
			size: FRAME_SIZE,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		this._frameBindGroup = device.createBindGroup({
			layout: frameLayout,
			entries: [{ binding: 0, resource: { buffer: this._frameBuffer } }],
		});
		this._drawLayout = drawLayout;
		this.ensureDrawCapacity(64);

		this._sampler = device.createSampler({
			addressModeU: "clamp-to-edge",
			addressModeV: "clamp-to-edge",
			magFilter: "linear",
			minFilter: "linear",
		});
		this._defaultTexture = new Texture(
			new Uint8ClampedArray([255, 255, 255, 255]),
			1,
			1
		);

		this._pickBuffer = device.createBuffer({
			label: "firefly pick readback",
			size: BYTES_PER_ROW_ALIGNMENT,
			usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
		});
	}

	/**
	 * Allocates the canvas pass's id and depth attachments. Named `initScene`
	 * to match the interface; unlike the WebGL backend there is no global
	 * state to configure here, because there is no global state.
	 */
	initScene(backgroundColor: vec4): void {
		this.setClearColor(backgroundColor);
		this.createSurfaceTextures();
	}

	/** The canvas pass's id and depth attachments, which only exist once
	 * `initScene` has run. */
	private requireSurface(): { id: GPUTexture; depth: GPUTexture } {
		if (!this._idTexture || !this._depthTexture) {
			throw new Error("Call initScene before rendering.");
		}
		return { id: this._idTexture, depth: this._depthTexture };
	}

	/** (Re)creates the id and depth textures at the current canvas size. */
	private createSurfaceTextures(): void {
		this._idTexture?.destroy();
		this._depthTexture?.destroy();

		const size = {
			width: Math.max(1, this._canvasSize[0]),
			height: Math.max(1, this._canvasSize[1]),
		};
		this._idTexture = this._device.createTexture({
			label: "firefly id target",
			size,
			format: ID_TEXTURE_FORMAT,
			usage:
				GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
		});
		this._depthTexture = this._device.createTexture({
			label: "firefly depth",
			size,
			format: DEPTH_TEXTURE_FORMAT,
			usage: GPUTextureUsage.RENDER_ATTACHMENT,
		});
	}

	get canvasSize(): vec2 {
		return this._canvasSize;
	}

	setClearColor(color: vec4): void {
		this._clearColor = color;
	}

	/**
	 * Resizes the canvas pass's attachments. The canvas texture itself follows
	 * the canvas element's size automatically, but the id and depth textures
	 * are fixed-size objects and have to be rebuilt - which is also what keeps
	 * picking aligned with what's on screen.
	 */
	resize(width: number, height: number): void {
		const w = Math.max(1, Math.floor(width));
		const h = Math.max(1, Math.floor(height));
		vec2.set(this._canvasSize, w, h);
		this.createSurfaceTextures();
	}

	/**
	 * Grows the per-draw uniform buffer to hold at least `count` draws.
	 *
	 * One buffer holds the whole frame's per-object data, and each draw binds
	 * it at a different dynamic offset - so there is exactly one upload per
	 * frame instead of one per object.
	 */
	private ensureDrawCapacity(count: number): void {
		if (count <= this._drawCapacity) {
			return;
		}
		// Grow in powers of two so a scene that steadily gains objects doesn't
		// reallocate on every single addition.
		let capacity = Math.max(64, this._drawCapacity);
		while (capacity < count) {
			capacity *= 2;
		}

		this._drawBuffer?.destroy();
		this._drawBuffer = this._device.createBuffer({
			label: "firefly draw uniforms",
			size: capacity * this._drawStride,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		this._drawStaging = new ArrayBuffer(capacity * this._drawStride);
		this._drawBindGroup = this._device.createBindGroup({
			layout: this._drawLayout,
			entries: [
				{
					binding: 0,
					resource: {
						buffer: this._drawBuffer,
						offset: 0,
						// The *window* one dynamic offset exposes, not the
						// whole buffer.
						size: DRAW_SIZE,
					},
				},
			],
		});
		this._drawCapacity = capacity;
	}

	/**
	 * Uploads any GPU resources a batch of renderables still needs. Cheap to
	 * call every frame: everything is a cache hit after the first time.
	 */
	private ensureResources(renderables: Renderable[]): void {
		renderables.forEach((obj: Renderable) => {
			this.ensureVertexBuffer(obj.vertexBuffer);
			this.ensureIndexBuffer(obj.indexBuffer);
			obj.material.properties.forEach((prop: MaterialProperty) => {
				if (prop.type === MaterialPropertyType.TEXTURE) {
					this.ensureTexture(prop.value as Texture);
				}
			});
		});
	}

	private ensureVertexBuffer(buffer: VertexBuffer): GPUBuffer {
		const existing = this._resources.vertexBuffers.get(buffer);
		if (existing) {
			return existing;
		}
		const gpuBuffer = this._device.createBuffer({
			label: "firefly vertices",
			size: alignTo(buffer.vertices.byteLength, 4),
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		});
		this._device.queue.writeBuffer(gpuBuffer, 0, buffer.vertices);
		this._resources.vertexBuffers.set(buffer, gpuBuffer);
		return gpuBuffer;
	}

	private ensureIndexBuffer(buffer: IndexBuffer): GPUBuffer {
		const existing = this._resources.indexBuffers.get(buffer);
		if (existing) {
			return existing;
		}
		const gpuBuffer = this._device.createBuffer({
			label: "firefly indices",
			size: alignTo(buffer.indices.byteLength, 4),
			usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
		});
		this._device.queue.writeBuffer(gpuBuffer, 0, buffer.indices);
		this._resources.indexBuffers.set(buffer, gpuBuffer);
		return gpuBuffer;
	}

	/**
	 * Uploads a texture and builds the bind group that binds it with the
	 * shared sampler.
	 *
	 * No mipmaps: WebGPU has no `generateMipmap`, and building a mip chain
	 * means rendering each level yourself. The WebGL backend does generate
	 * them, so a minified texture is slightly softer there than here - worth
	 * knowing, and worth revisiting if texturing becomes central.
	 */
	private ensureTexture(texture: Texture) {
		const existing = this._resources.textures.get(texture);
		if (existing) {
			return existing;
		}

		const gpuTexture = this._device.createTexture({
			label: "firefly texture",
			size: { width: texture.width, height: texture.height },
			format: "rgba8unorm",
			usage:
				GPUTextureUsage.TEXTURE_BINDING |
				GPUTextureUsage.COPY_DST |
				GPUTextureUsage.RENDER_ATTACHMENT,
		});
		this._device.queue.writeTexture(
			{ texture: gpuTexture },
			texture.data,
			{ bytesPerRow: texture.width * 4 },
			{ width: texture.width, height: texture.height }
		);

		const resources = {
			texture: gpuTexture,
			bindGroup: this._device.createBindGroup({
				layout: this._materialLayout,
				entries: [
					{ binding: 0, resource: gpuTexture.createView() },
					{ binding: 1, resource: this._sampler },
				],
			}),
		};
		this._resources.textures.set(texture, resources);
		return resources;
	}

	/**
	 * Draws one frame into the canvas.
	 *
	 * Both passes share a single render pass: the outline is not a separate
	 * pass at all, just a different pipeline (front-face culling) bound
	 * partway through. WebGL needs a mid-frame `cullFace` flip for the same
	 * effect; here the difference lives in the pipeline object.
	 */
	render(
		renderables: Renderable[],
		cam: Camera,
		ambientLight: vec3,
		lightPositions: vec3[],
		outlineRenderables: Renderable[] = []
	): void {
		if (this._disposed) {
			return;
		}

		this.ensureResources(renderables);
		this.ensureResources(outlineRenderables);
		this.uploadUniforms(cam, ambientLight, lightPositions, [
			renderables,
			outlineRenderables,
		]);

		const surface = this.requireSurface();
		const encoder = this._device.createCommandEncoder();
		const pass = encoder.beginRenderPass({
			label: "firefly scene",
			colorAttachments: [
				{
					view: this._context.getCurrentTexture().createView(),
					clearValue: {
						r: this._clearColor[0],
						g: this._clearColor[1],
						b: this._clearColor[2],
						a: this._clearColor[3],
					},
					loadOp: "clear",
					storeOp: "store",
				},
				{
					view: surface.id.createView(),
					// -1 is "no object here", exactly as in the WebGL backend -
					// pick() reports it as null.
					clearValue: { r: -1, g: 0, b: 0, a: 0 },
					loadOp: "clear",
					storeOp: "store",
				},
			],
			depthStencilAttachment: {
				view: surface.depth.createView(),
				depthClearValue: 1,
				depthLoadOp: "clear",
				depthStoreOp: "store",
			},
		});

		this.recordDraws(pass, renderables, 0, {
			cullMode: "back",
			colorFormat: this._canvasFormat,
		});
		this.recordDraws(pass, outlineRenderables, renderables.length, {
			cullMode: "front",
			colorFormat: this._canvasFormat,
		});

		pass.end();
		this._device.queue.submit([encoder.finish()]);
	}

	/**
	 * Stages and uploads this frame's uniforms: one per-frame struct, and one
	 * per-draw struct for every renderable across all the batches, laid out
	 * back to back at `_drawStride` intervals.
	 */
	private uploadUniforms(
		cam: Camera,
		ambientLight: vec3,
		lightPositions: vec3[],
		batches: Renderable[][]
	): void {
		// See CLIP_SPACE_CORRECTION: gl-matrix builds an OpenGL-convention
		// projection, and handing that to WebGPU unchanged clips away
		// everything nearer than the middle of the view volume.
		const projection = mat4.multiply(
			mat4.create(),
			CLIP_SPACE_CORRECTION,
			cam.perspectiveMatrix
		);
		writeFrameUniforms(
			this._frameStaging,
			cam.viewMatrix,
			projection,
			ambientLight,
			lightPositions
		);
		this._device.queue.writeBuffer(this._frameBuffer, 0, this._frameStaging);

		const total = batches.reduce((sum, batch) => sum + batch.length, 0);
		this.ensureDrawCapacity(total);

		const normalMatrix = mat3.create();
		let index = 0;
		batches.forEach((batch) => {
			batch.forEach((obj: Renderable) => {
				// normalFromMat4 returns null for a singular transform (e.g. a
				// just-spawned cube still scaled to zero). Resetting to
				// identity in that case matches the WebGL backend: such an
				// object is degenerate and invisible anyway.
				if (!mat3.normalFromMat4(normalMatrix, obj.transform)) {
					mat3.identity(normalMatrix);
				}
				writeDrawUniforms(
					this._drawStaging,
					index * this._drawStride,
					obj.transform,
					normalMatrix,
					materialColor(obj),
					obj.id
				);
				index++;
			});
		});

		if (total > 0) {
			this._device.queue.writeBuffer(
				this._drawBuffer,
				0,
				this._drawStaging,
				0,
				total * this._drawStride
			);
		}
	}

	/**
	 * Records the draw calls for one batch into an open render pass.
	 *
	 * @param drawIndexStart - Where this batch's per-draw uniforms begin
	 * within the shared buffer (batches are staged one after another)
	 */
	private recordDraws(
		pass: GPURenderPassEncoder,
		renderables: Renderable[],
		drawIndexStart: number,
		key: PipelineKey
	): void {
		pass.setBindGroup(0, this._frameBindGroup);

		renderables.forEach((obj: Renderable, i: number) => {
			const pipeline = this._pipelines.get(
				obj.material.program,
				obj.vertexBuffer.layout,
				key
			);
			pass.setPipeline(pipeline);
			pass.setBindGroup(1, this._drawBindGroup, [
				(drawIndexStart + i) * this._drawStride,
			]);
			pass.setBindGroup(2, this.materialBindGroup(obj));
			pass.setVertexBuffer(
				0,
				this._resources.requireVertexBuffer(obj.vertexBuffer)
			);
			pass.setIndexBuffer(
				this._resources.requireIndexBuffer(obj.indexBuffer),
				"uint32"
			);
			pass.drawIndexed(obj.indexBuffer.length);
		});
	}

	/** The texture bind group for a renderable's material, falling back to the
	 * 1x1 white default when the material has no texture of its own. */
	private materialBindGroup(obj: Renderable): GPUBindGroup {
		const textureProperty = obj.material.properties.find(
			(property: MaterialProperty) =>
				property.type === MaterialPropertyType.TEXTURE
		);
		const texture = textureProperty
			? (textureProperty.value as Texture)
			: this._defaultTexture;
		return this.ensureTexture(texture).bindGroup;
	}

	/**
	 * Reads back the object id drawn at a pixel.
	 *
	 * WebGPU textures use a top-left origin, the same as the DOM, so unlike
	 * the WebGL backend there is no Y flip here.
	 *
	 * Picks are serialized: a buffer cannot be mapped while an earlier
	 * `mapAsync` on it is outstanding, and clicks arrive faster than readbacks
	 * complete.
	 */
	async pick(x: number, y: number): Promise<number | null> {
		const run = this._pickQueue.then(() => this.pickNow(x, y));
		// Swallow failures on the chain itself so one bad pick doesn't poison
		// every later one; the caller still sees this pick's own rejection.
		this._pickQueue = run.then(
			() => undefined,
			() => undefined
		);
		return run;
	}

	private async pickNow(x: number, y: number): Promise<number | null> {
		const pixelX = Math.floor(x);
		const pixelY = Math.floor(y);
		if (
			this._disposed ||
			pixelX < 0 ||
			pixelY < 0 ||
			pixelX >= this._canvasSize[0] ||
			pixelY >= this._canvasSize[1]
		) {
			return null;
		}

		const encoder = this._device.createCommandEncoder();
		encoder.copyTextureToBuffer(
			{
				texture: this.requireSurface().id,
				origin: { x: pixelX, y: pixelY },
			},
			{ buffer: this._pickBuffer, bytesPerRow: BYTES_PER_ROW_ALIGNMENT },
			{ width: 1, height: 1 }
		);
		this._device.queue.submit([encoder.finish()]);

		await this._pickBuffer.mapAsync(GPUMapMode.READ);
		const id = new Int32Array(
			this._pickBuffer.getMappedRange().slice(0, 4)
		)[0];
		this._pickBuffer.unmap();

		// -1 is the clear value: nothing was drawn here. Real ids are entity
		// ids, always positive.
		return id === -1 ? null : id;
	}

	/** A target created by this backend always comes back to it, so this cast
	 * just re-attaches the type the caller dropped (see RenderTarget). */
	private impl(target: RenderTarget): GPURenderTargetImpl {
		return target as GPURenderTargetImpl;
	}

	createOffscreenTarget(width: number, height: number): RenderTarget {
		return this.createTargetTextures(
			Math.max(1, Math.floor(width)),
			Math.max(1, Math.floor(height))
		);
	}

	/** Allocates a fresh set of target attachments. A GPU texture's size is
	 * fixed at creation, so resizing means building a new set. */
	private createTargetTextures(w: number, h: number): GPURenderTargetImpl {
		const size = { width: w, height: h };
		return {
			colorTexture: this._device.createTexture({
				label: "firefly offscreen color",
				size,
				format: OFFSCREEN_COLOR_FORMAT,
				usage:
					GPUTextureUsage.RENDER_ATTACHMENT |
					GPUTextureUsage.COPY_SRC,
			}),
			idTexture: this._device.createTexture({
				label: "firefly offscreen id",
				size,
				format: ID_TEXTURE_FORMAT,
				usage: GPUTextureUsage.RENDER_ATTACHMENT,
			}),
			depthTexture: this._device.createTexture({
				label: "firefly offscreen depth",
				size,
				format: DEPTH_TEXTURE_FORMAT,
				usage: GPUTextureUsage.RENDER_ATTACHMENT,
			}),
			width: w,
			height: h,
		};
	}

	resizeOffscreenTarget(
		target: RenderTarget,
		width: number,
		height: number
	): void {
		const impl = this.impl(target);
		const w = Math.max(1, Math.floor(width));
		const h = Math.max(1, Math.floor(height));
		if (impl.width === w && impl.height === h) {
			return;
		}

		this.deleteOffscreenTarget(impl);
		const fresh = this.createTargetTextures(w, h);
		impl.colorTexture = fresh.colorTexture;
		impl.idTexture = fresh.idTexture;
		impl.depthTexture = fresh.depthTexture;
		impl.width = w;
		impl.height = h;
	}

	renderToTarget(
		target: RenderTarget,
		renderables: Renderable[],
		cam: Camera,
		ambientLight: vec3,
		lightPositions: vec3[]
	): void {
		if (this._disposed) {
			return;
		}
		const impl = this.impl(target);

		this.ensureResources(renderables);
		this.uploadUniforms(cam, ambientLight, lightPositions, [renderables]);

		const encoder = this._device.createCommandEncoder();
		const pass = encoder.beginRenderPass({
			label: "firefly offscreen",
			colorAttachments: [
				{
					view: impl.colorTexture.createView(),
					clearValue: {
						r: this._clearColor[0],
						g: this._clearColor[1],
						b: this._clearColor[2],
						a: this._clearColor[3],
					},
					loadOp: "clear",
					storeOp: "store",
				},
				{
					view: impl.idTexture.createView(),
					clearValue: { r: -1, g: 0, b: 0, a: 0 },
					loadOp: "clear",
					storeOp: "store",
				},
			],
			depthStencilAttachment: {
				view: impl.depthTexture.createView(),
				depthClearValue: 1,
				depthLoadOp: "clear",
				depthStoreOp: "store",
			},
		});

		this.recordDraws(pass, renderables, 0, {
			cullMode: "back",
			colorFormat: OFFSCREEN_COLOR_FORMAT,
		});

		pass.end();
		this._device.queue.submit([encoder.finish()]);
	}

	/**
	 * Copies an offscreen target's color image back to the CPU as RGBA8,
	 * top-left origin - already the layout `ImageData` wants, so no row flip
	 * (WebGL needs one; WebGPU does not).
	 *
	 * The GPU copy pads each row out to a 256-byte boundary, so unless the
	 * image happens to be a multiple of 64 pixels wide, the rows have to be
	 * compacted on the way out.
	 */
	async readTargetPixels(target: RenderTarget): Promise<Uint8Array> {
		const impl = this.impl(target);
		const unpaddedBytesPerRow = impl.width * 4;
		const paddedBytesPerRow = alignTo(
			unpaddedBytesPerRow,
			BYTES_PER_ROW_ALIGNMENT
		);

		const readBuffer = this._device.createBuffer({
			label: "firefly target readback",
			size: paddedBytesPerRow * impl.height,
			usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
		});

		const encoder = this._device.createCommandEncoder();
		encoder.copyTextureToBuffer(
			{ texture: impl.colorTexture },
			{ buffer: readBuffer, bytesPerRow: paddedBytesPerRow },
			{ width: impl.width, height: impl.height }
		);
		this._device.queue.submit([encoder.finish()]);

		await readBuffer.mapAsync(GPUMapMode.READ);
		const padded = new Uint8Array(readBuffer.getMappedRange());

		const pixels = new Uint8Array(unpaddedBytesPerRow * impl.height);
		for (let row = 0; row < impl.height; row++) {
			const start = row * paddedBytesPerRow;
			pixels.set(
				padded.subarray(start, start + unpaddedBytesPerRow),
				row * unpaddedBytesPerRow
			);
		}

		readBuffer.unmap();
		readBuffer.destroy();
		return pixels;
	}

	deleteOffscreenTarget(target: RenderTarget): void {
		const impl = this.impl(target);
		impl.colorTexture.destroy();
		impl.idTexture.destroy();
		impl.depthTexture.destroy();
	}

	deleteVertexBuffer(buffer: VertexBuffer): void {
		const gpuBuffer = this._resources.vertexBuffers.get(buffer);
		if (!gpuBuffer) {
			return;
		}
		gpuBuffer.destroy();
		this._resources.vertexBuffers.delete(buffer);
	}

	deleteIndexBuffer(buffer: IndexBuffer): void {
		const gpuBuffer = this._resources.indexBuffers.get(buffer);
		if (!gpuBuffer) {
			return;
		}
		gpuBuffer.destroy();
		this._resources.indexBuffers.delete(buffer);
	}

	deleteTexture(texture: Texture): void {
		const resources = this._resources.textures.get(texture);
		if (!resources) {
			return;
		}
		resources.texture.destroy();
		this._resources.textures.delete(texture);
	}

	/**
	 * Drops a program's compiled module. Pipelines built from it are left in
	 * the cache: they hold their own reference to the module, and Firefly's
	 * two programs live for the whole session, so evicting them would be
	 * bookkeeping with nothing to collect.
	 */
	deleteShaderProgram(program: ShaderProgram): void {
		this._resources.modules.delete(program);
	}

	dispose(): void {
		if (this._disposed) {
			return;
		}
		this._disposed = true;
		this._idTexture?.destroy();
		this._depthTexture?.destroy();
		this._frameBuffer.destroy();
		this._drawBuffer.destroy();
		this._pickBuffer.destroy();
		this._context.unconfigure();
		this._device.destroy();
	}
}

/** The material's base color, or opaque white if it declares none - the same
 * fallback the shaders' albedo multiply assumes. */
function materialColor(obj: Renderable): vec4 {
	const property = obj.material.properties.find(
		(candidate: MaterialProperty) =>
			candidate.type === MaterialPropertyType.VEC4 &&
			candidate.name === "u_color"
	);
	return property ? (property.value as vec4) : [1, 1, 1, 1];
}

/** Rounds `value` up to the next multiple of `alignment`. */
function alignTo(value: number, alignment: number): number {
	return Math.ceil(value / alignment) * alignment;
}

export { WebGPUBackend, alignTo, CLIP_SPACE_CORRECTION };
