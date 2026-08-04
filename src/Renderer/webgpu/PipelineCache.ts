import { VertexBufferLayout, VertexLayout, VertexTypes } from "../Buffer";
import { ShaderProgram } from "../Shader";
import { attributeLocation } from "../attributeLocations";
import { GPUResourceCache } from "./GPUResourceCache";

/** The format of the integer id target every pass writes alongside its color
 * image, for GPU picking. `r32sint` rather than WebGL's `R16I` because 32-bit
 * signed integer textures are the ones WebGPU guarantees are renderable. */
export const ID_TEXTURE_FORMAT: GPUTextureFormat = "r32sint";

/** The depth format used by every pass. */
export const DEPTH_TEXTURE_FORMAT: GPUTextureFormat = "depth24plus";

/**
 * Everything that has to be decided *before* a draw in WebGPU, and therefore
 * everything a pipeline is keyed by.
 *
 * This interface is the clearest statement of how the two APIs differ. In
 * WebGL, `render()` flips `gl.cullFace(FRONT)` mid-frame for the outline pass
 * and flips it back afterward - a one-line state poke. WebGPU has no such
 * knob: cull mode is baked into an immutable pipeline object at creation, so
 * "the same shader with front faces culled" is a second, separately-built
 * pipeline. Same for the target formats.
 */
export interface PipelineKey {
	/** "back" for normal geometry; "front" for the selection outline, which
	 * shows only the sliver of an enlarged copy poking past the real mesh. */
	cullMode: GPUCullMode;
	/** The color target's format - the canvas's preferred format for the
	 * interactive view, `rgba8unorm` for an offscreen target. */
	colorFormat: GPUTextureFormat;
}

/**
 * Builds and remembers render pipelines.
 *
 * Creating a pipeline compiles and validates the whole shader-plus-state
 * combination, which is far too expensive to do per frame - but the set of
 * combinations Firefly actually uses is tiny (two programs x two cull modes x
 * two color formats), so a plain map keyed by those choices is all the
 * strategy this needs.
 */
class PipelineCache {
	private _device: GPUDevice;
	private _layout: GPUPipelineLayout;
	private _resources: GPUResourceCache;
	private _pipelines = new Map<string, GPURenderPipeline>();

	/**
	 * @param device - The device to create pipelines on
	 * @param layout - The shared pipeline layout (frame / draw / material bind
	 * group layouts). Every Firefly shader takes the same three groups, so
	 * there is exactly one of these.
	 * @param resources - Where compiled shader modules are cached
	 */
	constructor(
		device: GPUDevice,
		layout: GPUPipelineLayout,
		resources: GPUResourceCache
	) {
		this._device = device;
		this._layout = layout;
		this._resources = resources;
	}

	/**
	 * Returns the pipeline for a program drawn with the given state and vertex
	 * layout, building it on first use.
	 *
	 * @param program - The shader program to draw with. Must carry a WGSL
	 * source; a GLSL-only program cannot be drawn by this backend.
	 * @param vertexLayout - The mesh layout feeding the vertex stage
	 * @param key - The pipeline state that isn't the shader
	 */
	get(
		program: ShaderProgram,
		vertexLayout: VertexBufferLayout,
		key: PipelineKey
	): GPURenderPipeline {
		const bufferLayout = vertexBufferLayoutFor(vertexLayout);
		const cacheKey = [
			programKey(program),
			key.cullMode,
			key.colorFormat,
			layoutSignature(vertexLayout),
		].join("|");

		const existing = this._pipelines.get(cacheKey);
		if (existing) {
			return existing;
		}

		const module = this.moduleFor(program);
		const pipeline = this._device.createRenderPipeline({
			label: `firefly ${key.cullMode}-cull ${key.colorFormat}`,
			layout: this._layout,
			vertex: {
				module,
				entryPoint: "vs_main",
				buffers: [bufferLayout],
			},
			fragment: {
				module,
				entryPoint: "fs_main",
				targets: [
					{
						format: key.colorFormat,
						blend: {
							color: {
								srcFactor: "src-alpha",
								dstFactor: "one-minus-src-alpha",
								operation: "add",
							},
							alpha: {
								srcFactor: "src-alpha",
								dstFactor: "one-minus-src-alpha",
								operation: "add",
							},
						},
					},
					// The id target takes no blend state: blending is not
					// allowed on an integer format, and would be meaningless
					// anyway - an id is not a color to mix.
					{ format: ID_TEXTURE_FORMAT },
				],
			},
			primitive: {
				topology: "triangle-list",
				cullMode: key.cullMode,
				// Matches WebGL's default and the winding every mesh in
				// Geometry/ is built with.
				frontFace: "ccw",
			},
			depthStencil: {
				format: DEPTH_TEXTURE_FORMAT,
				depthWriteEnabled: true,
				depthCompare: "less",
			},
		});

		this._pipelines.set(cacheKey, pipeline);
		return pipeline;
	}

	/** Compiles a program's WGSL into a shader module, once. */
	private moduleFor(program: ShaderProgram): GPUShaderModule {
		const existing = this._resources.modules.get(program);
		if (existing) {
			return existing;
		}
		if (program.wgsl === undefined) {
			throw new Error(
				"This shader program has no WGSL source, so the WebGPU " +
					"backend cannot draw with it. Add a .wgsl twin next to " +
					"its GLSL pair (see src/Shaders/wgsl/)."
			);
		}
		const module = this._device.createShaderModule({ code: program.wgsl });
		this._resources.modules.set(program, module);
		return module;
	}
}

// Programs are compared by identity, so each one gets a small stable number
// the first time it is seen rather than something derived from its source
// (hashing a few KB of WGSL per draw would cost more than the lookup saves).
const programKeys = new WeakMap<ShaderProgram, number>();
let nextProgramKey = 0;

function programKey(program: ShaderProgram): number {
	const existing = programKeys.get(program);
	if (existing !== undefined) {
		return existing;
	}
	const key = nextProgramKey++;
	programKeys.set(program, key);
	return key;
}

/** A short string identifying a vertex layout's shape, so two different
 * layouts can't collide on one cache entry. */
function layoutSignature(layout: VertexBufferLayout): string {
	return layout.layout
		.map((attribute: VertexLayout) => `${attribute.name}:${attribute.size}`)
		.join(",");
}

/** The WGSL vertex format for one attribute of a given component count. */
function vertexFormat(attribute: VertexLayout): GPUVertexFormat {
	if (attribute.type !== VertexTypes.FLOAT) {
		throw new Error("Unidentified VertexType!");
	}
	switch (attribute.size) {
		case 1:
			return "float32";
		case 2:
			return "float32x2";
		case 3:
			return "float32x3";
		case 4:
			return "float32x4";
		default:
			throw new Error(
				`Unsupported vertex attribute size ${attribute.size}.`
			);
	}
}

/**
 * Translates one of Firefly's VertexBufferLayouts into the interleaved
 * single-buffer layout a pipeline wants: byte offsets accumulated in
 * declaration order, and each attribute's name resolved to the slot number
 * both backends agree on (attributeLocations.ts).
 */
function vertexBufferLayoutFor(
	layout: VertexBufferLayout
): GPUVertexBufferLayout {
	let offset = 0;
	const attributes: GPUVertexAttribute[] = layout.layout.map(
		(attribute: VertexLayout) => {
			const entry: GPUVertexAttribute = {
				shaderLocation: attributeLocation(attribute.name),
				format: vertexFormat(attribute),
				offset,
			};
			offset += attribute.size * 4;
			return entry;
		}
	);

	return { arrayStride: offset, stepMode: "vertex", attributes };
}

export { PipelineCache, vertexBufferLayoutFor, layoutSignature };
