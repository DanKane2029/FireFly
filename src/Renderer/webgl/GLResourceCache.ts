import { VertexBuffer, IndexBuffer } from "../Buffer";
import { ShaderProgram } from "../Shader";
import { Texture } from "../Texture";

/** A vertex buffer's GPU-side pair: the uploaded data, and the vertex array
 * object capturing its attribute pointers and the paired index buffer's
 * binding (see WebGLBackend.createVertexArray). */
export interface VertexBufferResources {
	buffer: WebGLBuffer;
	vao: WebGLVertexArrayObject;
}

/** A linked program plus its two compiled stages, so all three can be deleted
 * together. */
export interface ProgramResources {
	program: WebGLProgram;
	vertexShader: WebGLShader;
	fragmentShader: WebGLShader;
}

/** An uploaded texture. `loaded` distinguishes "handle allocated" from "pixels
 * uploaded", which the default 1x1 white texture relies on. */
export interface TextureResources {
	texture: WebGLTexture;
	loaded: boolean;
}

/**
 * Maps Firefly's API-agnostic asset objects to this backend's GPU handles.
 *
 * The handles used to live *on* the assets - `VertexBuffer` held a
 * `WebGLBuffer`, `Texture` a `WebGLTexture`, and so on, each with a `created`
 * flag. That made every mesh permanently married to one WebGL context: two
 * contexts sharing a Mesh would each believe they had created it, and whichever
 * "created" it second would silently corrupt the first. It also made a second
 * *API* impossible, since there is no field a WebGPU handle could live in
 * without WebGL and WebGPU fighting over it.
 *
 * Keeping the mapping out here, owned by the backend, fixes both: an asset is
 * pure CPU-side data, each backend caches its own handles for it, and the
 * lifetime question ("has this been uploaded yet?") becomes a cache lookup
 * rather than a flag anyone can get wrong.
 *
 * The maps are `WeakMap`s so a mesh dropped by the asset registry doesn't keep
 * its cache entry alive. That does *not* free the GPU memory - only
 * `deleteVertexBuffer` and friends do that - it just means the bookkeeping
 * disappears with the asset instead of leaking.
 */
class GLResourceCache {
	readonly vertexBuffers = new WeakMap<VertexBuffer, VertexBufferResources>();
	readonly indexBuffers = new WeakMap<IndexBuffer, WebGLBuffer>();
	readonly programs = new WeakMap<ShaderProgram, ProgramResources>();
	readonly textures = new WeakMap<Texture, TextureResources>();

	/**
	 * Looks up a vertex buffer's handles, throwing if it was never uploaded.
	 * Used on the draw path, where a miss is a bug in the caller's
	 * ensure-then-draw ordering rather than something to recover from.
	 */
	requireVertexBuffer(buffer: VertexBuffer): VertexBufferResources {
		const resources = this.vertexBuffers.get(buffer);
		if (!resources) {
			throw new Error(
				"Vertex buffer has not been uploaded to this backend yet."
			);
		}
		return resources;
	}

	/** Looks up a program's handles, throwing if it was never linked. */
	requireProgram(program: ShaderProgram): ProgramResources {
		const resources = this.programs.get(program);
		if (!resources) {
			throw new Error(
				"Shader program has not been linked on this backend yet."
			);
		}
		return resources;
	}
}

export { GLResourceCache };
