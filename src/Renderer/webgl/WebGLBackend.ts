import { vec4, mat4, mat3, vec3, vec2 } from "gl-matrix";

import {
	VertexBuffer,
	IndexBuffer,
	VertexBufferLayout,
	VertexLayout,
	VertexTypes,
} from "../Buffer";
import { Shader, ShaderProgram, ShaderType } from "../Shader";
import { Texture } from "../Texture";
import { Material, MaterialProperty, MaterialPropertyType } from "../Material";
import { Camera } from "../Camera";
import {
	BackendKind,
	MAX_LIGHTS,
	RenderBackend,
	RenderTarget,
	Renderable,
} from "../RenderBackend";
import { ATTRIBUTE_LOCATIONS, attributeLocation } from "../attributeLocations";
import { GLResourceCache } from "./GLResourceCache";

/**
 * A second, smaller render target within the same WebGL context as the main
 * canvas - what the final-render panel draws into (see App.renderThroughCamera
 * and renderToTarget). RGBA8 color only, no id-texture: nothing ever needs to
 * pick an object in this render, so it skips the main framebuffer's
 * dual-attachment/MRT setup entirely.
 *
 * A second, independent `WebGL2RenderingContext` was considered and rejected
 * for this. That is no longer a hard constraint - GPU handles moved off the
 * asset objects and into GLResourceCache, so two contexts could each hold
 * their own handles for a shared Mesh without corrupting each other - but a
 * second framebuffer in the existing context is still simpler and cheaper than
 * a second context, so it stays.
 */
interface GLRenderTarget extends RenderTarget {
	framebuffer: WebGLFramebuffer;
	colorRenderbuffer: WebGLRenderbuffer;
	depthRenderbuffer: WebGLRenderbuffer;
	width: number;
	height: number;
}

/**
 * Renders a list of renderables through WebGL2.
 *
 * The backend owns the WebGL2 context and translates high-level objects
 * (meshes, materials, transforms) into GPU calls. The overall flow is:
 *
 *   1. initScene()       - one-time framebuffer + global GL state setup.
 *   2. ensureResources() - lazily upload buffers/shaders/textures.
 *   3. render()          - per frame: set uniforms and issue draw calls.
 *
 * Rendering targets an offscreen framebuffer with two color attachments: the
 * visible image and an integer id-texture used for GPU object picking, which
 * `pick` reads back on demand.
 *
 * WebGL is a global state machine, so almost everything here is bind-this,
 * set-that, draw. Contrast webgpu/WebGPUBackend.ts, which has to bake the same
 * decisions into immutable pipeline objects up front - the two files are worth
 * reading side by side.
 */
class WebGLBackend implements RenderBackend {
	readonly kind: BackendKind = "webgl2";

	private _gl: WebGL2RenderingContext;
	private _frameBuffer: WebGLFramebuffer;
	private _renderBuffer: WebGLRenderbuffer;
	private _idTexture: WebGLTexture;
	private _depthBuffer: WebGLRenderbuffer;
	private _canvasSize: vec2;
	private _clearColor: vec4;
	private _resources = new GLResourceCache();
	// A 1x1 white texture, always bound to TEXTURE0 before a material's own
	// properties are applied (see setMaterial). Materials with no texture
	// property still sample *something* through u_texture - white multiplies
	// into albedo as a no-op - so the shader never needs a "does this
	// material have a texture" branch or extra uniform.
	private _defaultTexture!: Texture;

	/**
	 * Creates a new WebGL backend.
	 *
	 * @param gl - The WebGL2 context to render to
	 * @param size - The initial canvas size in device pixels
	 */
	constructor(gl: WebGL2RenderingContext, size: vec2) {
		this._gl = gl;
		this._canvasSize = size;
		this._clearColor = [0, 0, 0, 1];

		this._frameBuffer = this.assertCreated(
			this._gl.createFramebuffer(),
			"framebuffer"
		);
		this._renderBuffer = this.assertCreated(
			this._gl.createRenderbuffer(),
			"renderbuffer"
		);
		this._idTexture = this.assertCreated(
			this._gl.createTexture(),
			"id texture"
		);
		this._depthBuffer = this.assertCreated(
			this._gl.createRenderbuffer(),
			"depth renderbuffer"
		);
	}

	/**
	 * Throws a clear error if a WebGL resource failed to be created. The GL
	 * create* calls return null on failure (e.g. a lost context), which is
	 * easy to miss - this turns that into an explicit, named failure.
	 *
	 * @param resource - The resource returned by a gl.create* call
	 * @param name - A human-readable name used in the error message
	 * @returns - The resource, guaranteed non-null
	 */
	private assertCreated<T>(resource: T | null, name: string): T {
		if (resource === null) {
			throw new Error(`Failed to create WebGL ${name}.`);
		}
		return resource;
	}

	/**
	 * One-time setup for a scene. Configures the offscreen framebuffer used for
	 * rendering and sets the global GL state that never changes frame to frame.
	 *
	 * The framebuffer has two color attachments (multiple render targets):
	 * - COLOR_ATTACHMENT0: an RGBA renderbuffer holding the visible image.
	 * - COLOR_ATTACHMENT1: an R16I texture where each pixel stores the id of the
	 *   object drawn there. Reading this texture back on click is how GPU
	 *   picking selects an object (see pick).
	 *
	 * Call once after the canvas is attached, before the first draw.
	 *
	 * @param backgroundColor - The clear color to apply
	 */
	initScene(backgroundColor: vec4): void {
		// set up framebuffer
		this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, this._frameBuffer);

		// set up color buffer (RGBA8: full 8 bits/channel, and a same-format
		// blit target as the RGBA8 canvas)
		this._gl.bindRenderbuffer(this._gl.RENDERBUFFER, this._renderBuffer);
		this._gl.renderbufferStorage(
			this._gl.RENDERBUFFER,
			this._gl.RGBA8,
			this._canvasSize[0],
			this._canvasSize[1]
		);
		this._gl.framebufferRenderbuffer(
			this._gl.FRAMEBUFFER,
			this._gl.COLOR_ATTACHMENT0,
			this._gl.RENDERBUFFER,
			this._renderBuffer
		);
		this._gl.bindRenderbuffer(this._gl.RENDERBUFFER, null);

		// set up id texture (COLOR_ATTACHMENT1) for GPU picking
		this._gl.activeTexture(this._gl.TEXTURE0);
		this._gl.bindTexture(this._gl.TEXTURE_2D, this._idTexture);
		this._gl.texStorage2D(
			this._gl.TEXTURE_2D,
			1,
			this._gl.R16I,
			this._canvasSize[0],
			this._canvasSize[1]
		);
		this._gl.framebufferTexture2D(
			this._gl.FRAMEBUFFER,
			this._gl.COLOR_ATTACHMENT1,
			this._gl.TEXTURE_2D,
			this._idTexture,
			0
		);

		// depth buffer so depth testing works while rendering into this
		// framebuffer (the default framebuffer's depth buffer is not used here)
		this._gl.bindRenderbuffer(this._gl.RENDERBUFFER, this._depthBuffer);
		this._gl.renderbufferStorage(
			this._gl.RENDERBUFFER,
			this._gl.DEPTH_COMPONENT16,
			this._canvasSize[0],
			this._canvasSize[1]
		);
		this._gl.framebufferRenderbuffer(
			this._gl.FRAMEBUFFER,
			this._gl.DEPTH_ATTACHMENT,
			this._gl.RENDERBUFFER,
			this._depthBuffer
		);
		this._gl.bindRenderbuffer(this._gl.RENDERBUFFER, null);

		// draw to both the color and id attachments each frame
		this._gl.drawBuffers([
			this._gl.COLOR_ATTACHMENT0,
			this._gl.COLOR_ATTACHMENT1,
		]);

		const status = this._gl.checkFramebufferStatus(this._gl.FRAMEBUFFER);
		if (status !== this._gl.FRAMEBUFFER_COMPLETE) {
			console.error(
				`Render framebuffer is incomplete (status 0x${status.toString(
					16
				)}); nothing will be drawn to the canvas.`
			);
		}

		this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, null);

		// global GL state that is constant for the lifetime of the scene
		this._gl.enable(this._gl.CULL_FACE);
		this._gl.cullFace(this._gl.BACK);
		this.setClearColor(backgroundColor);
		this._gl.enable(this._gl.DEPTH_TEST);
		this._gl.enable(this._gl.BLEND);
		this._gl.blendFunc(this._gl.SRC_ALPHA, this._gl.ONE_MINUS_SRC_ALPHA);

		this._defaultTexture = new Texture(
			new Uint8ClampedArray([255, 255, 255, 255]),
			1,
			1
		);
		this.ensureTexture(this._defaultTexture);
	}

	/**
	 * Lazily uploads GPU resources (vertex/index buffers, shader programs,
	 * textures) for any renderable that has not been uploaded yet. The resource
	 * cache tracks what already exists, so this is cheap to call every frame
	 * and automatically picks up entities added at runtime.
	 *
	 * @param renderables - The renderables whose GPU resources to upload
	 */
	private ensureResources(renderables: Renderable[]): void {
		renderables.forEach((obj: Renderable) => {
			this.ensureIndexBuffer(obj.indexBuffer);
			this.ensureVertexBuffer(obj.vertexBuffer, obj.indexBuffer);
			this.ensureProgram(obj.material.program);

			// create and load in all the textures
			obj.material.properties.forEach((prop: MaterialProperty) => {
				if (prop.type === MaterialPropertyType.TEXTURE) {
					this.ensureTexture(prop.value as Texture);
				}
			});
		});
	}

	/**
	 * Draws a list of renderables to the screen, lit by the given camera, ambient
	 * light, and point lights. The list is produced by the RenderSystem from the
	 * ECS world; the backend itself is world-agnostic.
	 *
	 * @param renderables - What to draw this frame - includes editor-only
	 * things like the transform gizmo's handles, which are real depth-tested
	 * entities like anything else (see GizmoAxis.ts's EditorOnly tag) so they
	 * can be occluded by real geometry in front of them
	 * @param cam - The camera whose view/projection to render from
	 * @param ambientLight - The scene ambient light color
	 * @param lightPositions - World-space positions of the point lights
	 * @param outlineRenderables - Drawn after the main pass, depth-tested and
	 * backface-only (see the cullFace toggle below) so only the sliver of
	 * each renderable that pokes out past the real geometry - a silhouette
	 * rim - actually shows (see Outline.ts)
	 */
	render(
		renderables: Renderable[],
		cam: Camera,
		ambientLight: vec3,
		lightPositions: vec3[],
		outlineRenderables: Renderable[] = []
	): void {
		this.clear();

		this.ensureResources(renderables);
		if (outlineRenderables.length > 0) {
			this.ensureResources(outlineRenderables);
		}

		// Render into the offscreen framebuffer so each object writes both its
		// shaded color (attachment 0) and its id (attachment 1) in one pass.
		this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, this._frameBuffer);

		this.drawRenderables(renderables, cam, ambientLight, lightPositions);

		if (outlineRenderables.length > 0) {
			// cullFace is BACK everywhere else in this backend (set once in
			// initScene and never toggled) - flipping to FRONT for just this
			// pass is what turns "the selected mesh, scaled up 3%" into a rim
			// instead of a fully solid oversized copy: with front faces
			// culled, only the backfaces poking out past the real mesh survive
			// the depth test against it.
			//
			// This is exactly the kind of mid-frame state flip WebGPU has no
			// equivalent for - see PipelineCache.ts, where the same effect
			// needs a whole second pipeline object.
			this._gl.cullFace(this._gl.FRONT);
			this.drawRenderables(
				outlineRenderables,
				cam,
				ambientLight,
				lightPositions
			);
			this._gl.cullFace(this._gl.BACK);
		}

		// Copy the shaded color image onto the visible canvas. The id-texture
		// (attachment 1) stays on the GPU for pick() to read on demand.
		this.blitColorToCanvas();

		this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, null);
	}

	/**
	 * Draws one list of renderables into whichever framebuffer is currently
	 * bound, lit by the given camera/ambient/point lights. Shared by the main
	 * scene pass and the overlay pass in render() above - the two differ only
	 * in cull-face state, which the caller controls.
	 */
	private drawRenderables(
		renderables: Renderable[],
		cam: Camera,
		ambientLight: vec3,
		lightPositions: vec3[]
	): void {
		renderables.forEach((obj: Renderable) => {
			const program = this._resources.requireProgram(
				obj.material.program
			).program;

			this.bindRenderable(obj);

			this.setUniform1i(program, "u_objectId", obj.id);
			this.setUniform4Mat(program, "u_perspective", cam.perspectiveMatrix);
			this.setUniform4Mat(program, "u_transform", obj.transform);
			this.setUniform4Mat(program, "u_view", cam.viewMatrix);

			// Normals need the inverse-transpose of the model matrix so they
			// stay perpendicular to the surface under non-uniform scaling.
			// normalFromMat4 returns null for a singular transform (e.g. a
			// just-spawned cube still scaled to zero); in that case we leave
			// normalMatrix as the identity it was initialized to, which is
			// harmless since such an object is degenerate and invisible.
			const normalMatrix = mat3.create();
			mat3.normalFromMat4(normalMatrix, obj.transform);
			this.setUniform3Mat(program, "u_normalMatrix", normalMatrix);

			// setup lights. The shader declares a fixed-size array, so ignore any
			// lights past it rather than writing uniforms that do not exist.
			const visibleLights = lightPositions.slice(0, MAX_LIGHTS);
			this.setUniform1i(program, "u_numLights", visibleLights.length);
			this.setUniform3f(program, "u_ambientLight", ambientLight);
			visibleLights.forEach((position: vec3, i: number) => {
				this.setUniform3f(program, `u_lightList[${i}].pos`, position);
			});

			this._gl.drawElements(
				this._gl.TRIANGLES,
				obj.indexBuffer.length,
				this._gl.UNSIGNED_INT,
				0
			);
			this.unbindRenderable();
		});
	}

	/**
	 * Copies the offscreen framebuffer's color image (COLOR_ATTACHMENT0) onto
	 * the default framebuffer, i.e. the visible canvas. Only the color image is
	 * copied - the id-texture is left in the framebuffer for picking.
	 */
	private blitColorToCanvas(): void {
		const width = this._canvasSize[0];
		const height = this._canvasSize[1];

		this._gl.bindFramebuffer(this._gl.READ_FRAMEBUFFER, this._frameBuffer);
		this._gl.readBuffer(this._gl.COLOR_ATTACHMENT0);
		this._gl.bindFramebuffer(this._gl.DRAW_FRAMEBUFFER, null);
		this._gl.blitFramebuffer(
			0,
			0,
			width,
			height,
			0,
			0,
			width,
			height,
			this._gl.COLOR_BUFFER_BIT,
			this._gl.NEAREST
		);
	}

	/**
	 * The pixel dimensions of the framebuffer's attachments (including the
	 * id-texture `pick` samples).
	 */
	get canvasSize(): vec2 {
		return this._canvasSize;
	}

	/**
	 * Resolves a click to the object drawn under it using GPU picking.
	 *
	 * Every frame the scene writes two things into one framebuffer via multiple
	 * render targets: the visible color image, and each object's integer id in a
	 * second R16I "id-texture" attachment. Picking is then just reading back the
	 * single id-texture pixel under the cursor - no ray-casting or CPU-side
	 * geometry math required. The read samples the last frame that was drawn, so
	 * it never triggers a re-render.
	 *
	 * The id-texture is cleared to -1, reported here as null (the background).
	 *
	 * WebGL can do this synchronously, but the returned promise is already
	 * resolved: `RenderBackend.pick` is async because WebGPU's readback can only
	 * be asynchronous, and one shared shape beats two (see RenderBackend.ts).
	 *
	 * @param x - X coordinate in id-texture pixels, from the left
	 * @param y - Y coordinate in id-texture pixels, from the top
	 * @returns - The picked object id, or null for background / on failure
	 */
	async pick(x: number, y: number): Promise<number | null> {
		const gl = this._gl;

		// WebGL's framebuffer origin is the bottom-left, but DOM coordinates
		// start at the top-left, so flip Y before reading.
		const pixelX = Math.floor(x);
		const pixelY = Math.floor(this._canvasSize[1] - 1 - y);

		if (
			pixelX < 0 ||
			pixelY < 0 ||
			pixelX >= this._canvasSize[0] ||
			pixelY >= this._canvasSize[1]
		) {
			return null;
		}

		gl.bindFramebuffer(gl.FRAMEBUFFER, this._frameBuffer);
		gl.readBuffer(gl.COLOR_ATTACHMENT1);

		// The read format/type must match the R16I id-texture. Query what the
		// implementation actually supports so we can fail gracefully on
		// platforms that can't read an integer render target.
		const format = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_FORMAT);
		const type = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE);

		let id: number | null = null;
		if (format === gl.RED_INTEGER) {
			const data =
				type === gl.INT ? new Int32Array(1) : new Int16Array(1);
			gl.readPixels(pixelX, pixelY, 1, 1, format, type, data);

			if (gl.getError() === gl.NO_ERROR) {
				// -1 is the clear value: nothing was drawn here. Every real
				// pick is an entity id, always positive (World hands those
				// out starting at 1) - the gizmo's handles are real entities
				// like anything else now (see GizmoAxis.ts's GizmoHandle),
				// with no reserved id range of their own.
				id = data[0] === -1 ? null : data[0];
			} else {
				console.warn("GPU picking: failed to read the id-texture.");
			}
		} else {
			console.warn(
				"GPU picking unsupported: this platform cannot read the " +
					"integer id-texture."
			);
		}

		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		return id;
	}

	/**
	 * Uploads a vertex buffer and builds its vertex array object, if this
	 * backend has not already done so.
	 *
	 * @param buffer - The vertex buffer to upload
	 * @param indexBuffer - The index buffer whose binding the VAO captures
	 */
	private ensureVertexBuffer(
		buffer: VertexBuffer,
		indexBuffer: IndexBuffer
	): void {
		if (this._resources.vertexBuffers.has(buffer)) {
			return;
		}

		const glBuffer = this.assertCreated(this._gl.createBuffer(), "buffer");
		this._gl.bindBuffer(this._gl.ARRAY_BUFFER, glBuffer);
		this._gl.bufferData(
			this._gl.ARRAY_BUFFER,
			buffer.vertices,
			this._gl.STATIC_DRAW
		);

		const vao = this.createVertexArray(glBuffer, buffer.layout, indexBuffer);
		this._resources.vertexBuffers.set(buffer, { buffer: glBuffer, vao });
	}

	/**
	 * Creates a vertex array object that captures a vertex buffer's attribute
	 * pointers/enables and the paired index buffer's ELEMENT_ARRAY_BUFFER
	 * binding, so drawing it is just `bindVertexArray` instead of re-issuing
	 * `vertexAttribPointer`/`enableVertexAttribArray` every frame.
	 *
	 * This exists to close a latent bug: without a VAO per mesh, attribute
	 * state set up for one mesh's layout stays enabled - still pointing at
	 * that mesh's buffer with that mesh's stride - while a *different* mesh
	 * with a different layout (e.g. one with `a_texCoord`, one without) draws
	 * next. The symptom is intermittent geometry corruption that looks like a
	 * shader bug. It only went unnoticed before texturing because every mesh
	 * happened to share the identical `[a_position, a_normal]` layout.
	 *
	 * Note that no shader program is involved. Attribute locations are pinned
	 * in attributeLocations.ts rather than looked up per-program, so a mesh's
	 * attribute setup is valid against *any* program - which is also what lets
	 * the WGSL shaders address the same slots by number.
	 *
	 * @param glBuffer - The uploaded vertex data
	 * @param layout - How that data divides into named attributes
	 * @param indexBuffer - The index buffer to capture the binding of
	 * @returns - The vertex array object
	 */
	private createVertexArray(
		glBuffer: WebGLBuffer,
		layout: VertexBufferLayout,
		indexBuffer: IndexBuffer
	): WebGLVertexArrayObject {
		const vao = this.assertCreated(
			this._gl.createVertexArray(),
			"vertex array"
		);
		this._gl.bindVertexArray(vao);
		this._gl.bindBuffer(this._gl.ARRAY_BUFFER, glBuffer);
		this.setVertexAttributes(layout);
		this._gl.bindBuffer(
			this._gl.ELEMENT_ARRAY_BUFFER,
			this.ensureIndexBuffer(indexBuffer)
		);
		this._gl.bindVertexArray(null);
		return vao;
	}

	/**
	 * Uploads an index buffer if this backend has not already done so.
	 *
	 * @param buffer - The index buffer to upload
	 * @returns - The GPU buffer holding the indices
	 */
	private ensureIndexBuffer(buffer: IndexBuffer): WebGLBuffer {
		const existing = this._resources.indexBuffers.get(buffer);
		if (existing) {
			return existing;
		}

		const glBuffer = this.assertCreated(this._gl.createBuffer(), "buffer");
		this._gl.bindBuffer(this._gl.ELEMENT_ARRAY_BUFFER, glBuffer);
		this._gl.bufferData(
			this._gl.ELEMENT_ARRAY_BUFFER,
			buffer.indices,
			this._gl.STATIC_DRAW
		);
		this._resources.indexBuffers.set(buffer, glBuffer);
		return glBuffer;
	}

	/**
	 * Frees a vertex buffer's GPU memory - and its vertex array object, which
	 * describes this exact buffer and becomes garbage the moment the buffer is
	 * gone. Call when the mesh it belongs to is no longer referenced by
	 * anything in the world (e.g. an asset is unloaded).
	 *
	 * @param buffer - The vertex buffer to delete
	 */
	deleteVertexBuffer(buffer: VertexBuffer): void {
		const resources = this._resources.vertexBuffers.get(buffer);
		if (!resources) {
			return;
		}
		this._gl.deleteVertexArray(resources.vao);
		this._gl.deleteBuffer(resources.buffer);
		this._resources.vertexBuffers.delete(buffer);
	}

	/**
	 * Frees an index buffer's GPU memory.
	 *
	 * @param buffer - The index buffer to delete
	 */
	deleteIndexBuffer(buffer: IndexBuffer): void {
		const glBuffer = this._resources.indexBuffers.get(buffer);
		if (!glBuffer) {
			return;
		}
		this._gl.deleteBuffer(glBuffer);
		this._resources.indexBuffers.delete(buffer);
	}

	/**
	 * Compiles one shader stage.
	 *
	 * @param shader - The shader stage to compile
	 * @returns - The compiled GPU shader
	 */
	private compileShader(shader: Shader): WebGLShader {
		const shaderType =
			shader.type === ShaderType.FRAGMENT
				? this._gl.FRAGMENT_SHADER
				: this._gl.VERTEX_SHADER;

		const glShader = this.assertCreated(
			this._gl.createShader(shaderType),
			"shader"
		);
		this._gl.shaderSource(glShader, shader.glsl);
		this._gl.compileShader(glShader);

		return glShader;
	}

	/**
	 * Compiles and links a shader program if this backend has not already done
	 * so.
	 *
	 * Attribute locations are bound explicitly from attributeLocations.ts
	 * *before* linking, rather than queried afterward with `getAttribLocation`.
	 * That is what lets a mesh's VAO be built without reference to any
	 * particular program, and keeps WebGL agreeing with WGSL's numeric
	 * `@location` slots.
	 *
	 * @param shaderProgram - The shader program to link
	 */
	private ensureProgram(shaderProgram: ShaderProgram): void {
		if (this._resources.programs.has(shaderProgram)) {
			return;
		}

		const vertexShader = this.compileShader(shaderProgram.vertexShader);
		const fragmentShader = this.compileShader(shaderProgram.fragmentShader);
		const program = this.assertCreated(
			this._gl.createProgram(),
			"shader program"
		);

		this._gl.attachShader(program, vertexShader);
		this._gl.attachShader(program, fragmentShader);

		Object.entries(ATTRIBUTE_LOCATIONS).forEach(([name, location]) => {
			this._gl.bindAttribLocation(program, location, name);
		});

		this._gl.linkProgram(program);

		if (!this._gl.getProgramParameter(program, this._gl.LINK_STATUS)) {
			const log = this._gl.getProgramInfoLog(program);
			const vertexLog = this._gl.getShaderInfoLog(vertexShader);
			const fragmentLog = this._gl.getShaderInfoLog(fragmentShader);
			throw new Error(
				`Shader program failed to link: ${log}\n` +
					`vertex: ${vertexLog}\nfragment: ${fragmentLog}`
			);
		}

		this._resources.programs.set(shaderProgram, {
			program,
			vertexShader,
			fragmentShader,
		});
	}

	/**
	 * Deletes a linked shader program and its two compiled stages. Call when
	 * nothing in the world references the program anymore (e.g. the last user
	 * of a material is unloaded).
	 *
	 * @param shaderProgram - The shader program to delete
	 */
	deleteShaderProgram(shaderProgram: ShaderProgram): void {
		const resources = this._resources.programs.get(shaderProgram);
		if (!resources) {
			return;
		}
		this._gl.deleteProgram(resources.program);
		this._gl.deleteShader(resources.vertexShader);
		this._gl.deleteShader(resources.fragmentShader);
		this._resources.programs.delete(shaderProgram);
	}

	/**
	 * Sets an integer uniform in a shader program.
	 *
	 * getUniformLocation returns null when the uniform is unused/optimized out;
	 * the gl.uniform* calls accept null as a harmless no-op. That applies to
	 * every setUniform* method here.
	 */
	private setUniform1i(
		program: WebGLProgram,
		name: string,
		int: number
	): void {
		this._gl.uniform1i(this._gl.getUniformLocation(program, name), int);
	}

	/** Sets a vec3 uniform in a shader program. */
	private setUniform3f(
		program: WebGLProgram,
		name: string,
		value: vec3
	): void {
		this._gl.uniform3fv(this._gl.getUniformLocation(program, name), value);
	}

	/** Sets a vec4 uniform in a shader program. */
	private setUniform4f(
		program: WebGLProgram,
		name: string,
		value: vec4
	): void {
		this._gl.uniform4fv(this._gl.getUniformLocation(program, name), value);
	}

	/** Sets a mat4 uniform in a shader program. */
	private setUniform4Mat(
		program: WebGLProgram,
		name: string,
		value: mat4
	): void {
		this._gl.uniformMatrix4fv(
			this._gl.getUniformLocation(program, name),
			false,
			value
		);
	}

	/** Sets a mat3 uniform in a shader program. */
	private setUniform3Mat(
		program: WebGLProgram,
		name: string,
		value: mat3
	): void {
		this._gl.uniformMatrix3fv(
			this._gl.getUniformLocation(program, name),
			false,
			value
		);
	}

	/**
	 * Points the pinned attribute slots at their slices of the currently bound
	 * vertex buffer. Called once per mesh, while its VAO is bound (see
	 * createVertexArray) - the VAO captures the resulting attribute pointers
	 * and enables, so this never needs to run again for that mesh.
	 *
	 * @param vertexLayout - The layout of the attributes to wire up
	 */
	private setVertexAttributes(vertexLayout: VertexBufferLayout): void {
		let offset = 0;
		const stride: number = vertexLayout.layout
			.map((attribute: VertexLayout) => {
				return this.getTypeSize(attribute.type) * attribute.size;
			})
			.reduce((total: number, cur: number) => (total += cur));

		vertexLayout.layout.forEach((attribute: VertexLayout) => {
			const { name, size, type, normalized } = attribute;
			const glType: number = this.toGLType(type);
			const location: number = attributeLocation(name);

			this._gl.vertexAttribPointer(
				location,
				size,
				glType,
				normalized,
				stride,
				offset
			);
			this._gl.enableVertexAttribArray(location);

			offset += this.getTypeSize(type) * size;
		});
	}

	/**
	 * Uploads a texture's pixels if this backend has not already done so.
	 *
	 * @param texture - The texture to upload
	 * @returns - The GPU texture
	 */
	private ensureTexture(texture: Texture): WebGLTexture {
		const existing = this._resources.textures.get(texture);
		if (existing && existing.loaded) {
			return existing.texture;
		}

		const glTexture =
			existing?.texture ??
			this.assertCreated(this._gl.createTexture(), "texture");

		const level = 0;
		const internalFormat = this._gl.RGBA;
		const border = 0;
		const srcFormat = this._gl.RGBA;
		const srcType = this._gl.UNSIGNED_BYTE;

		this._gl.bindTexture(this._gl.TEXTURE_2D, glTexture);
		this._gl.texImage2D(
			this._gl.TEXTURE_2D,
			level,
			internalFormat,
			texture.width,
			texture.height,
			border,
			srcFormat,
			srcType,
			texture.data
		);
		this._gl.generateMipmap(this._gl.TEXTURE_2D);

		// The WebGL default sampler state (REPEAT wrap, a mipmapped min filter)
		// is exactly what generateMipmap above expects, but it's still worth
		// being explicit rather than relying on defaults: CLAMP_TO_EDGE avoids
		// seams at UV 0/1 for a non-tiling texture, and naming the filters here
		// is what makes it obvious mipmaps are assumed to exist.
		this._gl.texParameteri(
			this._gl.TEXTURE_2D,
			this._gl.TEXTURE_WRAP_S,
			this._gl.CLAMP_TO_EDGE
		);
		this._gl.texParameteri(
			this._gl.TEXTURE_2D,
			this._gl.TEXTURE_WRAP_T,
			this._gl.CLAMP_TO_EDGE
		);
		this._gl.texParameteri(
			this._gl.TEXTURE_2D,
			this._gl.TEXTURE_MIN_FILTER,
			this._gl.LINEAR_MIPMAP_LINEAR
		);
		this._gl.texParameteri(
			this._gl.TEXTURE_2D,
			this._gl.TEXTURE_MAG_FILTER,
			this._gl.LINEAR
		);

		this._resources.textures.set(texture, {
			texture: glTexture,
			loaded: true,
		});
		return glTexture;
	}

	/**
	 * Frees a texture's GPU memory.
	 *
	 * @param texture - The texture to delete
	 */
	deleteTexture(texture: Texture): void {
		const resources = this._resources.textures.get(texture);
		if (!resources) {
			return;
		}
		this._gl.deleteTexture(resources.texture);
		this._resources.textures.delete(texture);
	}

	/**
	 * Gets a material ready to be used in a shader program: selects its program
	 * and uploads its properties as uniforms.
	 *
	 * @param material - The material to set up
	 */
	private setMaterial(material: Material): void {
		const program = this._resources.requireProgram(material.program).program;
		this._gl.useProgram(program);

		// Always bind the default white texture to TEXTURE0 first, so
		// u_texture is never left pointing at whatever the previously-drawn
		// material happened to bind. A material with its own TEXTURE property
		// overwrites this binding below.
		this._gl.activeTexture(this._gl.TEXTURE0);
		this._gl.bindTexture(
			this._gl.TEXTURE_2D,
			this.ensureTexture(this._defaultTexture)
		);
		this.setUniform1i(program, "u_texture", 0);

		material.properties.forEach((property: MaterialProperty) => {
			const { name, value } = property;
			switch (property.type) {
				case MaterialPropertyType.VEC4:
					this.setUniform4f(program, name, value as vec4);
					break;

				case MaterialPropertyType.MAT4:
					this.setUniform4Mat(program, name, value as mat4);
					break;

				case MaterialPropertyType.TEXTURE:
					this._gl.activeTexture(this._gl.TEXTURE0);
					this._gl.bindTexture(
						this._gl.TEXTURE_2D,
						this.ensureTexture(value as Texture)
					);
					this.setUniform1i(program, name, 0);
					break;
			}
		});
	}

	/**
	 * Sets the color that the backend clears the screen to before rendering the
	 * scene on top of it.
	 *
	 * @param color - The clear color value
	 */
	setClearColor(color: vec4): void {
		this._clearColor = color;
		this._gl.clearColor(color[0], color[1], color[2], color[3]);
	}

	/**
	 * Clears the offscreen framebuffer at the start of a frame:
	 * - attachment 0 (the color image) to the background color,
	 * - attachment 1 (the picking id-texture) to -1 = "no object here",
	 * - the depth buffer so stale depth values don't block new fragments.
	 *
	 * The visible canvas does not need a separate clear: every frame the whole
	 * color image is blitted onto it (see blitColorToCanvas), fully overwriting
	 * the previous frame.
	 */
	private clear(): void {
		this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, this._frameBuffer);
		this._gl.clearBufferfv(
			this._gl.COLOR,
			0,
			new Float32Array(this._clearColor)
		);
		this._gl.clearBufferiv(
			this._gl.COLOR,
			1,
			new Int16Array([-1, -1, -1, -1])
		);
		this._gl.clear(this._gl.DEPTH_BUFFER_BIT);
		this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, null);
	}

	/**
	 * Resizes the offscreen framebuffer and its attachments to a new pixel size.
	 *
	 * Changing the GL viewport alone is not enough: the color, id, and depth
	 * attachments were allocated at a fixed size in initScene, so without
	 * reallocating them the rendered image and the picking id-texture keep their
	 * old resolution and object picking drifts once the canvas changes size.
	 * Renderbuffers can be re-storaged in place; the id texture was created with
	 * immutable storage (texStorage2D), so it must be recreated.
	 *
	 * _canvasSize is updated in place so holders of the reference keep seeing
	 * the current size.
	 *
	 * @param width - The new width in device pixels
	 * @param height - The new height in device pixels
	 */
	resize(width: number, height: number): void {
		const w = Math.max(1, Math.floor(width));
		const h = Math.max(1, Math.floor(height));
		vec2.set(this._canvasSize, w, h);

		this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, this._frameBuffer);

		// Color renderbuffer (COLOR_ATTACHMENT0): resizable in place.
		this._gl.bindRenderbuffer(this._gl.RENDERBUFFER, this._renderBuffer);
		this._gl.renderbufferStorage(
			this._gl.RENDERBUFFER,
			this._gl.RGBA8,
			w,
			h
		);
		this._gl.bindRenderbuffer(this._gl.RENDERBUFFER, null);

		// Id texture (COLOR_ATTACHMENT1): immutable storage, so recreate it and
		// re-attach the new texture to the same framebuffer slot.
		this._gl.deleteTexture(this._idTexture);
		this._idTexture = this.assertCreated(
			this._gl.createTexture(),
			"id texture"
		);
		this._gl.activeTexture(this._gl.TEXTURE0);
		this._gl.bindTexture(this._gl.TEXTURE_2D, this._idTexture);
		this._gl.texStorage2D(this._gl.TEXTURE_2D, 1, this._gl.R16I, w, h);
		this._gl.framebufferTexture2D(
			this._gl.FRAMEBUFFER,
			this._gl.COLOR_ATTACHMENT1,
			this._gl.TEXTURE_2D,
			this._idTexture,
			0
		);
		this._gl.bindTexture(this._gl.TEXTURE_2D, null);

		// Depth renderbuffer: resizable in place.
		this._gl.bindRenderbuffer(this._gl.RENDERBUFFER, this._depthBuffer);
		this._gl.renderbufferStorage(
			this._gl.RENDERBUFFER,
			this._gl.DEPTH_COMPONENT16,
			w,
			h
		);
		this._gl.bindRenderbuffer(this._gl.RENDERBUFFER, null);

		this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, null);
		this._gl.viewport(0, 0, w, h);
	}

	/**
	 * A render target created by this backend. Targets are opaque to callers
	 * (see RenderTarget) and always come back to the backend that made them, so
	 * this cast is safe - it just re-attaches the type the caller dropped.
	 */
	private glTarget(target: RenderTarget): GLRenderTarget {
		return target as GLRenderTarget;
	}

	/**
	 * Allocates a new offscreen render target (see GLRenderTarget's doc
	 * comment) at the given pixel size, within this backend's own WebGL
	 * context. Call `deleteOffscreenTarget` when done with it (e.g. the Render
	 * panel unmounts).
	 */
	createOffscreenTarget(width: number, height: number): RenderTarget {
		const target: GLRenderTarget = {
			framebuffer: this.assertCreated(
				this._gl.createFramebuffer(),
				"offscreen framebuffer"
			),
			colorRenderbuffer: this.assertCreated(
				this._gl.createRenderbuffer(),
				"offscreen color renderbuffer"
			),
			depthRenderbuffer: this.assertCreated(
				this._gl.createRenderbuffer(),
				"offscreen depth renderbuffer"
			),
			width: 0,
			height: 0,
		};

		this.resizeOffscreenTarget(target, width, height);

		// A single color attachment - unlike the main framebuffer (initScene),
		// this target never writes a picking id-texture, so it only ever draws
		// into COLOR_ATTACHMENT0. Set once; draw-buffer state belongs to this
		// FBO object and isn't touched by resizing its attachments.
		this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, target.framebuffer);
		this._gl.drawBuffers([this._gl.COLOR_ATTACHMENT0]);
		this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, null);

		return target;
	}

	/**
	 * Resizes an offscreen render target's attachments in place, mirroring
	 * `resize()`'s reallocation of the main framebuffer. A no-op if the size is
	 * unchanged, so callers (e.g. a ResizeObserver-driven panel) can call this
	 * on every observed size without worrying about redundant reallocation.
	 */
	resizeOffscreenTarget(
		target: RenderTarget,
		width: number,
		height: number
	): void {
		const glTarget = this.glTarget(target);
		const w = Math.max(1, Math.floor(width));
		const h = Math.max(1, Math.floor(height));
		if (glTarget.width === w && glTarget.height === h) {
			return;
		}
		glTarget.width = w;
		glTarget.height = h;

		this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, glTarget.framebuffer);

		this._gl.bindRenderbuffer(
			this._gl.RENDERBUFFER,
			glTarget.colorRenderbuffer
		);
		this._gl.renderbufferStorage(
			this._gl.RENDERBUFFER,
			this._gl.RGBA8,
			w,
			h
		);
		this._gl.framebufferRenderbuffer(
			this._gl.FRAMEBUFFER,
			this._gl.COLOR_ATTACHMENT0,
			this._gl.RENDERBUFFER,
			glTarget.colorRenderbuffer
		);

		this._gl.bindRenderbuffer(
			this._gl.RENDERBUFFER,
			glTarget.depthRenderbuffer
		);
		this._gl.renderbufferStorage(
			this._gl.RENDERBUFFER,
			this._gl.DEPTH_COMPONENT16,
			w,
			h
		);
		this._gl.framebufferRenderbuffer(
			this._gl.FRAMEBUFFER,
			this._gl.DEPTH_ATTACHMENT,
			this._gl.RENDERBUFFER,
			glTarget.depthRenderbuffer
		);

		this._gl.bindRenderbuffer(this._gl.RENDERBUFFER, null);

		const status = this._gl.checkFramebufferStatus(this._gl.FRAMEBUFFER);
		if (status !== this._gl.FRAMEBUFFER_COMPLETE) {
			console.error(
				`Offscreen render target framebuffer is incomplete (status 0x${status.toString(
					16
				)}); nothing will be drawn to it.`
			);
		}

		this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, null);
	}

	/**
	 * Renders one list of renderables into an offscreen target instead of the
	 * main canvas - used by the final-render panel, never by the interactive
	 * Scene view. No outline/picking passes: this is meant to look like a
	 * shipped render, not an editor view.
	 *
	 * `gl.viewport` is global GL state, not per-framebuffer, so this
	 * temporarily points it at the target's size and restores it to the main
	 * canvas's size afterward - otherwise the next interactive frame would
	 * render at the wrong resolution.
	 */
	renderToTarget(
		target: RenderTarget,
		renderables: Renderable[],
		cam: Camera,
		ambientLight: vec3,
		lightPositions: vec3[]
	): void {
		const glTarget = this.glTarget(target);
		this.ensureResources(renderables);

		this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, glTarget.framebuffer);
		this._gl.viewport(0, 0, glTarget.width, glTarget.height);
		this._gl.clearColor(
			this._clearColor[0],
			this._clearColor[1],
			this._clearColor[2],
			this._clearColor[3]
		);
		this._gl.clear(this._gl.COLOR_BUFFER_BIT | this._gl.DEPTH_BUFFER_BIT);

		this.drawRenderables(renderables, cam, ambientLight, lightPositions);

		this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, null);
		this._gl.viewport(0, 0, this._canvasSize[0], this._canvasSize[1]);
	}

	/**
	 * Reads an offscreen target's color attachment back into CPU memory as
	 * RGBA8 - a standard, always-readable readPixels format/type combination
	 * for any implementation, unlike the id-texture's IMPLEMENTATION_COLOR_READ_*
	 * branching in pick(). The Render panel wraps the result in an ImageData and
	 * draws it to a plain 2D canvas.
	 *
	 * readPixels' origin is the bottom-left row (WebGL/GL convention); the
	 * result is row-flipped in place before returning so it matches the
	 * top-left-origin RGBA8 that RenderBackend.readTargetPixels promises.
	 *
	 * Resolves immediately - the promise is for WebGPU's benefit, not WebGL's.
	 */
	async readTargetPixels(target: RenderTarget): Promise<Uint8Array> {
		const glTarget = this.glTarget(target);
		const pixels = new Uint8Array(glTarget.width * glTarget.height * 4);

		this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, glTarget.framebuffer);
		this._gl.readBuffer(this._gl.COLOR_ATTACHMENT0);
		this._gl.readPixels(
			0,
			0,
			glTarget.width,
			glTarget.height,
			this._gl.RGBA,
			this._gl.UNSIGNED_BYTE,
			pixels
		);
		this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, null);

		flipRowsInPlace(pixels, glTarget.width, glTarget.height);
		return pixels;
	}

	/**
	 * Frees an offscreen target's GPU memory. Call when done with it (e.g. the
	 * Render panel unmounts, or is about to recreate the target against a new
	 * backend - see App.rendererGeneration).
	 */
	deleteOffscreenTarget(target: RenderTarget): void {
		const glTarget = this.glTarget(target);
		this._gl.deleteFramebuffer(glTarget.framebuffer);
		this._gl.deleteRenderbuffer(glTarget.colorRenderbuffer);
		this._gl.deleteRenderbuffer(glTarget.depthRenderbuffer);
	}

	/**
	 * Releases the framebuffer and its attachments. Per-asset GPU resources
	 * (mesh buffers, textures, programs) are intentionally *not* walked here:
	 * they are cached in WeakMaps keyed by assets this backend does not own,
	 * and dropping the context releases them anyway. The asset registry frees
	 * them explicitly when an asset is unloaded while a canvas is still
	 * attached.
	 */
	dispose(): void {
		this._gl.deleteFramebuffer(this._frameBuffer);
		this._gl.deleteRenderbuffer(this._renderBuffer);
		this._gl.deleteRenderbuffer(this._depthBuffer);
		this._gl.deleteTexture(this._idTexture);
	}

	/**
	 * Binds the buffers and material associated with a renderable so it can be
	 * drawn. Binding the vertex array object is what actually establishes the
	 * vertex/index buffer bindings and attribute pointers - see
	 * createVertexArray - so this no longer re-issues per-attribute GL calls
	 * every draw.
	 *
	 * @param obj - The renderable to bind
	 */
	private bindRenderable(obj: Renderable): void {
		const resources = this._resources.requireVertexBuffer(obj.vertexBuffer);
		this._gl.bindVertexArray(resources.vao);
		this.setMaterial(obj.material);
	}

	/**
	 * Unbinds the vertex array object and shader.
	 */
	private unbindRenderable(): void {
		this._gl.bindVertexArray(null);
		this._gl.useProgram(null);
	}

	/**
	 * Converts internal VertexTypes to appropriate WebGL type
	 *
	 * @param type - The internal VertexTypes type to be converted
	 * @returns - The WebGL value of the converted type
	 */
	private toGLType(type: VertexTypes): number {
		switch (type) {
			case VertexTypes.FLOAT:
				return this._gl.FLOAT;
			default:
				throw new Error("Unidentified VertexType!");
		}
	}

	/**
	 * Gets the number of bytes to store the VertexType
	 *
	 * @param type - The VertexType to get the size of
	 * @returns - The number of bytes required to store the input VertexType
	 */
	private getTypeSize(type: VertexTypes): number {
		switch (type) {
			case VertexTypes.FLOAT:
				return 4;
			default:
				throw new Error("Unidentified VertexType!");
		}
	}
}

/**
 * Flips an RGBA8 pixel buffer's rows in place, converting between GL's
 * bottom-left-origin readPixels result and a top-left-origin image format
 * (ImageData, PNG, ...). Used by readTargetPixels; not needed anywhere else
 * in this backend since the main canvas is presented via blitFramebuffer,
 * which the browser already flips correctly on its own.
 */
function flipRowsInPlace(
	pixels: Uint8Array,
	width: number,
	height: number
): void {
	const rowBytes = width * 4;
	const rowBuffer = new Uint8Array(rowBytes);
	for (let y = 0; y < Math.floor(height / 2); y++) {
		const top = y * rowBytes;
		const bottom = (height - 1 - y) * rowBytes;
		rowBuffer.set(pixels.subarray(top, top + rowBytes));
		pixels.copyWithin(top, bottom, bottom + rowBytes);
		pixels.set(rowBuffer, bottom);
	}
}

export { WebGLBackend, flipRowsInPlace };
