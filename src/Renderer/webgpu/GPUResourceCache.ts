import { VertexBuffer, IndexBuffer } from "../Buffer";
import { ShaderProgram } from "../Shader";
import { Texture } from "../Texture";

/** An uploaded texture and the bind group that binds it (with the shared
 * sampler) as group 2. The bind group is cached alongside the texture because
 * it never varies for a given texture and rebuilding one per draw is pure
 * overhead. */
export interface TextureResources {
	texture: GPUTexture;
	bindGroup: GPUBindGroup;
}

/**
 * Maps Firefly's API-agnostic asset objects to WebGPU handles - the WebGPU
 * counterpart of webgl/GLResourceCache.ts, and the reason both backends can
 * hold their own handles for the very same Mesh at the same time.
 *
 * See GLResourceCache's doc comment for why the handles live out here rather
 * than on the assets themselves.
 */
class GPUResourceCache {
	readonly vertexBuffers = new WeakMap<VertexBuffer, GPUBuffer>();
	readonly indexBuffers = new WeakMap<IndexBuffer, GPUBuffer>();
	readonly modules = new WeakMap<ShaderProgram, GPUShaderModule>();
	readonly textures = new WeakMap<Texture, TextureResources>();

	/** Looks up a vertex buffer's GPU buffer, throwing if it was never
	 * uploaded - a miss on the draw path is an ensure-then-draw ordering bug,
	 * not something to recover from. */
	requireVertexBuffer(buffer: VertexBuffer): GPUBuffer {
		const gpuBuffer = this.vertexBuffers.get(buffer);
		if (!gpuBuffer) {
			throw new Error(
				"Vertex buffer has not been uploaded to this backend yet."
			);
		}
		return gpuBuffer;
	}

	/** Looks up an index buffer's GPU buffer, throwing if it was never
	 * uploaded. */
	requireIndexBuffer(buffer: IndexBuffer): GPUBuffer {
		const gpuBuffer = this.indexBuffers.get(buffer);
		if (!gpuBuffer) {
			throw new Error(
				"Index buffer has not been uploaded to this backend yet."
			);
		}
		return gpuBuffer;
	}
}

export { GPUResourceCache };
