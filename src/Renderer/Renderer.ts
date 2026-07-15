import { vec4, mat4, mat3, vec3, vec2 } from "gl-matrix";

import {
	VertexBuffer,
	IndexBuffer,
	VertexBufferLayout,
	VertexLayout,
	VertexTypes,
} from "./Buffer";
import { Shader, ShaderProgram, ShaderType } from "./Shader";
import { Texture } from "./Texture";
import { Material, MaterialProperty, MaterialPropertyType } from "./Material";
import { Camera } from "./Camera";

/**
 * The number of point lights the lighting shader declares (`MAX_LIGHTS` in
 * Lighting.frag.glsl). Lights past this are ignored; keep the two in step.
 */
const MAX_LIGHTS = 10;

/**
 * One thing to draw this frame: a mesh (its GPU buffers) with a material and a
 * world transform, plus the id to write into the picking id-texture. The
 * RenderSystem builds these from the ECS world; the Renderer stays a pure GPU
 * backend that knows nothing about entities or the scene graph.
 */
export interface Renderable {
	id: number;
	transform: mat4;
	material: Material;
	vertexBuffer: VertexBuffer;
	indexBuffer: IndexBuffer;
}

/**
 * Renders a list of renderables to a WebGL canvas.
 *
 * The Renderer owns the WebGL2 context and translates high-level objects
 * (meshes, materials, transforms) into GPU calls. The overall flow is:
 *
 *   1. initScene()      - one-time framebuffer + global GL state setup.
 *   2. ensureResources() - lazily upload buffers/shaders/textures.
 *   3. render()         - per frame: set uniforms and issue draw calls.
 *
 * Rendering targets an offscreen framebuffer with two color attachments: the
 * visible image and an integer id-texture used for GPU object picking.
 */
class Renderer {
	private _gl: WebGL2RenderingContext;
	public _frameBuffer: WebGLFramebuffer;
	public _renderBuffer: WebGLRenderbuffer;
	public _idTexture: WebGLTexture;
	private _depthBuffer: WebGLRenderbuffer;
	private _canvasSize: vec2;
	private _clearColor: vec4;
	// A 1x1 white texture, always bound to TEXTURE0 before a material's own
	// properties are applied (see setMaterial). Materials with no texture
	// property still sample *something* through u_texture - white multiplies
	// into albedo as a no-op - so the shader never needs a "does this
	// material have a texture" branch or extra uniform.
	private _defaultTexture!: Texture;

	/**
	 * Creates a new Renderer
	 *
	 * @param gl - The WebGL2 context to render to
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
	 *   picking selects an object (see Picker).
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
		this.enable(this._gl.DEPTH_TEST);
		this._gl.enable(this._gl.BLEND);
		this._gl.blendFunc(this._gl.SRC_ALPHA, this._gl.ONE_MINUS_SRC_ALPHA);

		this._defaultTexture = new Texture(
			new Uint8ClampedArray([255, 255, 255, 255]),
			1,
			1
		);
		this.createTexture(this._defaultTexture);
		this.loadTexture(this._defaultTexture);
	}

	/**
	 * Lazily uploads GPU resources (vertex/index buffers, shader programs,
	 * textures) for any renderable that has not been uploaded yet. Buffers and
	 * programs track this with `created` flags, so this is cheap to call every
	 * frame and automatically picks up entities added at runtime.
	 *
	 * @param renderables - The renderables whose GPU resources to upload
	 */
	ensureResources(renderables: Renderable[]): void {
		renderables.forEach((obj: Renderable) => {
			if (!obj.vertexBuffer.created) {
				this.createVertexBuffer(obj.vertexBuffer);
			}

			if (!obj.indexBuffer.created) {
				this.createIndexBuffer(obj.indexBuffer);
			}

			if (!obj.material.program.created) {
				this.createShaderProgram(obj.material.program);
			}

			if (!obj.vertexBuffer.vaoCreated) {
				this.createVertexArray(
					obj.vertexBuffer,
					obj.indexBuffer,
					obj.material.program
				);
			}

			// create and load in all the textures
			obj.material.properties.forEach((prop: MaterialProperty) => {
				switch (prop.type) {
					case MaterialPropertyType.TEXTURE: {
						const texture: Texture = prop.value as Texture;
						if (!texture.created) {
							this.createTexture(texture);
						}

						if (!texture.loaded) {
							this.loadTexture(texture);
						}

						break;
					}
				}
			});
		});
	}

	/**
	 * Draws a list of renderables to the screen, lit by the given camera, ambient
	 * light, and point lights. The list is produced by the RenderSystem from the
	 * ECS world; the Renderer itself is world-agnostic.
	 *
	 * @param renderables - What to draw this frame
	 * @param cam - The camera whose view/projection to render from
	 * @param ambientLight - The scene ambient light color
	 * @param lightPositions - World-space positions of the point lights
	 */
	render(
		renderables: Renderable[],
		cam: Camera,
		ambientLight: vec3,
		lightPositions: vec3[],
		overlayRenderables: Renderable[] = []
	): void {
		this.clear();

		this.ensureResources(renderables);
		if (overlayRenderables.length > 0) {
			this.ensureResources(overlayRenderables);
		}

		// Render into the offscreen framebuffer so each object writes both its
		// shaded color (attachment 0) and its id (attachment 1) in one pass.
		this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, this._frameBuffer);

		this.drawRenderables(renderables, cam, ambientLight, lightPositions);

		if (overlayRenderables.length > 0) {
			// The overlay (currently just the transform gizmo) draws in a
			// second pass with depth testing off, so its handles are always
			// visible on top of the scene regardless of what's in front of
			// them - a contained change rather than threading an "is this an
			// overlay" flag through the single draw loop above. It still
			// writes to the id-texture, so the handles stay pickable through
			// the same GPU-picking readback as everything else.
			this._gl.disable(this._gl.DEPTH_TEST);
			this.drawRenderables(
				overlayRenderables,
				cam,
				ambientLight,
				lightPositions
			);
			this._gl.enable(this._gl.DEPTH_TEST);
		}

		// Copy the shaded color image onto the visible canvas. The id-texture
		// (attachment 1) stays on the GPU for the Picker to read on demand.
		this.blitColorToCanvas();

		this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, null);
	}

	/**
	 * Draws one list of renderables into whichever framebuffer is currently
	 * bound, lit by the given camera/ambient/point lights. Shared by the main
	 * scene pass and the overlay pass in render() above - the two differ only
	 * in depth-test state, which the caller controls.
	 */
	private drawRenderables(
		renderables: Renderable[],
		cam: Camera,
		ambientLight: vec3,
		lightPositions: vec3[]
	): void {
		renderables.forEach((obj: Renderable) => {
			this.bindRenderable(obj);

			const shaderProgram: ShaderProgram = obj.material.program;

			this.setUniform1i(shaderProgram, "u_objectId", obj.id);

			this.setUniform4Mat(
				shaderProgram,
				"u_perspective",
				cam.perspectiveMatrix
			);

			this.setUniform4Mat(shaderProgram, "u_transform", obj.transform);
			this.setUniform4Mat(shaderProgram, "u_view", cam.viewMatrix);

			// Normals need the inverse-transpose of the model matrix so they
			// stay perpendicular to the surface under non-uniform scaling.
			// normalFromMat4 returns null for a singular transform (e.g. a
			// just-spawned cube still scaled to zero); in that case we leave
			// normalMatrix as the identity it was initialized to, which is
			// harmless since such an object is degenerate and invisible.
			const normalMatrix = mat3.create();
			mat3.normalFromMat4(normalMatrix, obj.transform);
			this.setUniform3Mat(shaderProgram, "u_normalMatrix", normalMatrix);

			// setup lights. The shader declares a fixed-size array, so ignore any
			// lights past it rather than writing uniforms that do not exist.
			const visibleLights = lightPositions.slice(0, MAX_LIGHTS);
			this.setUniform1i(
				shaderProgram,
				"u_numLights",
				visibleLights.length
			);
			this.setUniform3f(shaderProgram, "u_ambientLight", ambientLight);
			visibleLights.forEach((position: vec3, i: number) => {
				this.setPointLight(
					shaderProgram,
					`u_lightList[${i}]`,
					position
				);
			});

			this.drawElements(
				this._gl.TRIANGLES,
				obj.indexBuffer.length,
				this._gl.UNSIGNED_INT
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

	get context(): WebGL2RenderingContext {
		return this._gl;
	}

	/**
	 * The offscreen framebuffer the scene is rendered into. Its second color
	 * attachment holds the object-id texture the Picker reads.
	 */
	get frameBuffer(): WebGLFramebuffer {
		return this._frameBuffer;
	}

	/**
	 * The pixel dimensions of the framebuffer's attachments (including the
	 * id-texture the Picker samples).
	 */
	get canvasSize(): vec2 {
		return this._canvasSize;
	}

	/**
	 * Draws the binded vertex buffer using the binded index buffer and shader program
	 *
	 * @param mode - The drawing mode in WebGL (usually gl.TRIANGLES)
	 * @param count - The number of elements to draw
	 * @param type - The data type of the binded data to draw
	 */
	drawElements(mode: number, count: number, type: number): void {
		this._gl.drawElements(mode, count, type, 0);
	}

	/**
	 * Creates a vertex buffer in the WebGL context
	 *
	 * @param buffer - The vertex buffer to create
	 */
	createVertexBuffer(buffer: VertexBuffer): void {
		buffer.buffer = this.assertCreated(this._gl.createBuffer(), "buffer");
		buffer.created = true;
		this.bindVertexBuffer(buffer);
		this._gl.bufferData(
			this._gl.ARRAY_BUFFER,
			buffer.vertices,
			this._gl.STATIC_DRAW
		);
	}

	/**
	 * Binds a vertex buffer to the ARRAY_BUFFER target
	 *
	 * @param buffer - The vertex buffer to bind
	 */
	bindVertexBuffer(buffer: VertexBuffer): void {
		if (!buffer.created) {
			throw new Error(
				"Trying to bind vertex buffer that hasn't been created yet"
			);
		}

		this._gl.bindBuffer(this._gl.ARRAY_BUFFER, buffer.buffer);
	}

	/**
	 * Unbinds a vertex buffer to the ARRAY_BUFFER target
	 */
	unbindVertexBuffer(): void {
		this._gl.bindBuffer(this._gl.ARRAY_BUFFER, null);
	}

	/**
	 * Frees a vertex buffer's GPU memory and marks it uncreated, so it would be
	 * re-uploaded if ever reused. Call when the mesh it belongs to is no longer
	 * referenced by anything in the world (e.g. an asset is unloaded).
	 *
	 * Also frees this buffer's vertex array object, if it has one - a VAO
	 * captures this exact buffer's attribute bindings, so it becomes garbage
	 * the moment the buffer it describes is gone.
	 *
	 * @param buffer - The vertex buffer to delete
	 */
	deleteVertexBuffer(buffer: VertexBuffer): void {
		if (buffer.vaoCreated) {
			this.deleteVertexArray(buffer);
		}
		if (!buffer.created) {
			return;
		}
		this._gl.deleteBuffer(buffer.buffer);
		buffer.created = false;
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
	 * @param vertexBuffer - The vertex buffer to capture attribute state for
	 * @param indexBuffer - The index buffer to capture the binding of
	 * @param shaderProgram - The shader program whose attribute locations the
	 * layout is resolved against (all materials currently share one program,
	 * so this is safe to bake in at VAO-creation time)
	 */
	createVertexArray(
		vertexBuffer: VertexBuffer,
		indexBuffer: IndexBuffer,
		shaderProgram: ShaderProgram
	): void {
		vertexBuffer.vao = this.assertCreated(
			this._gl.createVertexArray(),
			"vertex array"
		);
		this._gl.bindVertexArray(vertexBuffer.vao);
		this.bindVertexBuffer(vertexBuffer);
		this.setVertexAttributes(shaderProgram, vertexBuffer.layout);
		this.bindIndexBuffer(indexBuffer);
		this._gl.bindVertexArray(null);
		vertexBuffer.vaoCreated = true;
	}

	/**
	 * Frees a vertex array object's GPU memory and marks it uncreated.
	 *
	 * @param vertexBuffer - The vertex buffer whose VAO to delete
	 */
	deleteVertexArray(vertexBuffer: VertexBuffer): void {
		if (!vertexBuffer.vaoCreated) {
			return;
		}
		this._gl.deleteVertexArray(vertexBuffer.vao);
		vertexBuffer.vaoCreated = false;
	}

	/**
	 * Creates a index buffer in the WebGL context
	 *
	 * @param buffer - The index buffer to create
	 */
	createIndexBuffer(buffer: IndexBuffer): void {
		buffer.buffer = this.assertCreated(this._gl.createBuffer(), "buffer");
		buffer.created = true;
		this.bindIndexBuffer(buffer);
		this._gl.bufferData(
			this._gl.ELEMENT_ARRAY_BUFFER,
			buffer.indices,
			this._gl.STATIC_DRAW
		);
	}

	/**
	 * Binds an index buffer to the ELEMENT_ARRAY_BUFFER target
	 *
	 * @param buffer - The index buffer to bind
	 */
	bindIndexBuffer(buffer: IndexBuffer): void {
		if (!buffer.created) {
			throw new Error(
				"Trying to bind index buffer that hasn't been created yet"
			);
		}

		this._gl.bindBuffer(this._gl.ELEMENT_ARRAY_BUFFER, buffer.buffer);
	}

	/**
	 * Unbinds an index buffer to the ELEMENT_ARRAY_BUFFER target
	 */
	unbindIndexBuffer(): void {
		this._gl.bindBuffer(this._gl.ELEMENT_ARRAY_BUFFER, null);
	}

	/**
	 * Frees an index buffer's GPU memory and marks it uncreated.
	 *
	 * @param buffer - The index buffer to delete
	 */
	deleteIndexBuffer(buffer: IndexBuffer): void {
		if (!buffer.created) {
			return;
		}
		this._gl.deleteBuffer(buffer.buffer);
		buffer.created = false;
	}

	/**
	 * Creates a shader in the WebGL context
	 *
	 * @param shader - The shader to create
	 */
	createShader(shader: Shader): void {
		const shaderType =
			shader.type === ShaderType.FRAGMENT
				? this._gl.FRAGMENT_SHADER
				: this._gl.VERTEX_SHADER;

		shader.shader = this.assertCreated(
			this._gl.createShader(shaderType),
			"shader"
		);
		this._gl.shaderSource(shader.shader, shader.source);
		this._gl.compileShader(shader.shader);

		shader.created = true;
	}

	/**
	 * Creates a shader program in the WebGL context
	 *
	 * @param shaderProgram - The shader program to create
	 */
	createShaderProgram(shaderProgram: ShaderProgram): void {
		if (!shaderProgram.vertexShader.created) {
			this.createShader(shaderProgram.vertexShader);
		}

		if (!shaderProgram.fragmentShader.created) {
			this.createShader(shaderProgram.fragmentShader);
		}

		shaderProgram.program = this.assertCreated(
			this._gl.createProgram(),
			"shader program"
		);

		this._gl.attachShader(
			shaderProgram.program,
			shaderProgram.vertexShader.shader
		);
		this._gl.attachShader(
			shaderProgram.program,
			shaderProgram.fragmentShader.shader
		);

		this._gl.linkProgram(shaderProgram.program);
		this._gl.useProgram(shaderProgram.program);

		shaderProgram.created = true;
	}

	/**
	 * Selects a shader program to use when rendering an object
	 *
	 * @param shaderProgram - The shader program to use
	 */
	useProgram(shaderProgram: ShaderProgram): void {
		this._gl.useProgram(shaderProgram.program);
	}

	/**
	 * Stop using the current shader program
	 */
	dropProgram(): void {
		this._gl.useProgram(null);
	}

	/**
	 * Deletes a linked shader program and its two compiled shader stages, and
	 * marks all three uncreated. Call when nothing in the world references the
	 * program anymore (e.g. the last user of a material is unloaded).
	 *
	 * @param shaderProgram - The shader program to delete
	 */
	deleteShaderProgram(shaderProgram: ShaderProgram): void {
		if (shaderProgram.created) {
			this._gl.deleteProgram(shaderProgram.program);
			shaderProgram.created = false;
		}
		[shaderProgram.vertexShader, shaderProgram.fragmentShader].forEach(
			(shader: Shader) => {
				if (shader.created) {
					this._gl.deleteShader(shader.shader);
					shader.created = false;
				}
			}
		);
	}

	/**
	 * Sets an integer uniform in a shader program
	 *
	 * @param shaderProgram - The shader program to set the integer in
	 * @param name - The name of the integer uniform
	 * @param int - The value of the integer uniform
	 */
	setUniform1i(
		shaderProgram: ShaderProgram,
		name: string,
		int: number
	): void {
		// getUniformLocation returns null when the uniform is unused/optimized
		// out; the gl.uniform* calls accept null as a harmless no-op.
		const location = this._gl.getUniformLocation(
			shaderProgram.program,
			name
		);
		this._gl.uniform1i(location, int);
	}

	/**
	 * Sets an vec3 uniform in a shader program
	 *
	 * @param shaderProgram - The shader program to set the vec4 in
	 * @param name - The name of the vec3 uniform
	 * @param int - The value of the vec3 uniform
	 */
	setUniform3f(shaderProgram: ShaderProgram, name: string, vec3: vec3): void {
		// getUniformLocation returns null when the uniform is unused/optimized
		// out; the gl.uniform* calls accept null as a harmless no-op.
		const location = this._gl.getUniformLocation(
			shaderProgram.program,
			name
		);
		this._gl.uniform3fv(location, vec3);
	}

	/**
	 * Sets an vec4 uniform in a shader program
	 *
	 * @param shaderProgram - The shader program to set the vec4 in
	 * @param name - The name of the vec4 uniform
	 * @param int - The value of the vec4 uniform
	 */
	setUniform4f(shaderProgram: ShaderProgram, name: string, vec4: vec4): void {
		// getUniformLocation returns null when the uniform is unused/optimized
		// out; the gl.uniform* calls accept null as a harmless no-op.
		const location = this._gl.getUniformLocation(
			shaderProgram.program,
			name
		);
		this._gl.uniform4fv(location, vec4);
	}

	/**
	 * Sets an mat4 uniform in a shader program
	 *
	 * @param shaderProgram - The shader program to set the mat4 in
	 * @param name - The name of the mat4 uniform
	 * @param int - The value of the mat4 uniform
	 */
	setUniform4Mat(
		shaderProgram: ShaderProgram,
		name: string,
		mat4: mat4
	): void {
		// getUniformLocation returns null when the uniform is unused/optimized
		// out; the gl.uniform* calls accept null as a harmless no-op.
		const location = this._gl.getUniformLocation(
			shaderProgram.program,
			name
		);
		this._gl.uniformMatrix4fv(location, false, mat4);
	}

	/**
	 * Sets a mat3 uniform in a shader program
	 *
	 * @param shaderProgram - The shader program to set the mat3 in
	 * @param name - The name of the mat3 uniform
	 * @param matrix - The value of the mat3 uniform
	 */
	setUniform3Mat(
		shaderProgram: ShaderProgram,
		name: string,
		matrix: mat3
	): void {
		// getUniformLocation returns null when the uniform is unused/optimized
		// out; the gl.uniform* calls accept null as a harmless no-op.
		const location = this._gl.getUniformLocation(
			shaderProgram.program,
			name
		);
		this._gl.uniformMatrix3fv(location, false, matrix);
	}

	/**
	 * Sets the data in a point light in a shader program
	 *
	 * @param shaderProgram - The shader program to set the point light in
	 * @param name - The name of the point light
	 * @param position - The world-space position of the point light
	 */
	setPointLight(shaderProgram: ShaderProgram, name: string, position: vec3) {
		this.setUniform3f(shaderProgram, `${name}.pos`, position);
	}

	/**
	 * Defines the vertex attributes in a vertex buffer layout in a shader
	 * program. Called once per mesh, while its VAO is bound (see
	 * createVertexArray) - the VAO captures the resulting attribute pointers
	 * and enables, so this never needs to run again for that mesh.
	 *
	 * @param shaderProgram - The shader program to add the vertex attributes
	 * @param vertexLayout - The layout of the attributes to define in the shader program
	 */
	setVertexAttributes(
		shaderProgram: ShaderProgram,
		vertexLayout: VertexBufferLayout
	): void {
		this.useProgram(shaderProgram);
		let offset = 0;
		const stride: number = vertexLayout.layout
			.map((attribute: VertexLayout) => {
				return this.getTypeSize(attribute.type) * attribute.size;
			})
			.reduce((total: number, cur: number) => (total += cur));

		vertexLayout.layout.forEach((attribute: VertexLayout) => {
			const { name, size, type, normalized } = attribute;
			const glType: number = this.toGLType(type);
			const location: number = this._gl.getAttribLocation(
				shaderProgram.program,
				name
			);

			if (location >= 0) {
				this._gl.vertexAttribPointer(
					location,
					size,
					glType,
					normalized,
					stride,
					offset
				);
				this._gl.enableVertexAttribArray(location);
			}

			offset += this.getTypeSize(type) * size;
		});
	}

	/**
	 * Creates a texture within the WebGL context
	 *
	 * @param texture - The texture to create
	 */
	createTexture(texture: Texture): void {
		texture.texture = this.assertCreated(
			this._gl.createTexture(),
			"texture"
		);
		texture.created = true;
	}

	/**
	 * Binds a texture within a WebGL context
	 *
	 * @param texture - The texture to bind
	 */
	bindTexture(texture: Texture): void {
		this._gl.bindTexture(this._gl.TEXTURE_2D, texture.texture);
	}

	/**
	 * Loads a texture to be used in a shader program
	 *
	 * @param texture - The texture to load
	 */
	loadTexture(texture: Texture): void {
		const level = 0;
		const internalFormat = this._gl.RGBA;
		const width = texture.width;
		const height = texture.height;
		const border = 0;
		const srcFormat = this._gl.RGBA;
		const srcType = this._gl.UNSIGNED_BYTE;
		const data = texture.data;

		this._gl.bindTexture(this._gl.TEXTURE_2D, texture.texture);
		this._gl.texImage2D(
			this._gl.TEXTURE_2D,
			level,
			internalFormat,
			width,
			height,
			border,
			srcFormat,
			srcType,
			data
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

		texture.loaded = true;
	}

	/**
	 * Deletes a texture's GPU memory and marks it uncreated/unloaded.
	 *
	 * @param texture - The texture to delete
	 */
	deleteTexture(texture: Texture): void {
		if (!texture.created) {
			return;
		}
		this._gl.deleteTexture(texture.texture);
		texture.created = false;
		texture.loaded = false;
	}

	/**
	 * Gets a material ready to be used in a shader program. It prepares the material properties to be used in the shader program.
	 *
	 * @param material - The material to set to be used in a shader program
	 */
	setMaterial(material: Material) {
		const shaderProgram: ShaderProgram = material.program;
		this.useProgram(shaderProgram);

		// Always bind the default white texture to TEXTURE0 first, so
		// u_texture is never left pointing at whatever the previously-drawn
		// material happened to bind. A material with its own TEXTURE property
		// overwrites this binding below.
		this._gl.activeTexture(this._gl.TEXTURE0);
		this.bindTexture(this._defaultTexture);
		this.setUniform1i(shaderProgram, "u_texture", 0);

		material.properties.forEach((property: MaterialProperty) => {
			const { name, value } = property;
			switch (property.type) {
				case MaterialPropertyType.VEC4:
					this.setUniform4f(shaderProgram, name, value as vec4);
					break;

				case MaterialPropertyType.MAT4:
					this.setUniform4Mat(shaderProgram, name, value as mat4);
					break;

				case MaterialPropertyType.TEXTURE:
					this._gl.activeTexture(this._gl.TEXTURE0);
					this.bindTexture(value as Texture);
					this.setUniform1i(shaderProgram, name, 0);
					break;
			}
		});
	}

	/**
	 * Sets the color that the renderer sets the screen to before rendering the scene on top of it.
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
	clear(): void {
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
	 * Sets flags in WebGL to define different behavior
	 *
	 * @param flag - The flag value to set in WebGL
	 */
	enable(flag: number): void {
		this._gl.enable(flag);
	}

	/**
	 * Sets the size of the viewport to the given width and height
	 *
	 * @param width - The width of the viewport
	 * @param height - The height of the viewport
	 */
	setViewport(width: number, height: number): void {
		this._gl.viewport(0, 0, width, height);
	}

	/**
	 * Resizes the offscreen framebuffer and its attachments to a new pixel size.
	 *
	 * Changing the GL viewport alone (setViewport) is not enough: the color, id,
	 * and depth attachments were allocated at a fixed size in initScene, so
	 * without reallocating them the rendered image and the picking id-texture
	 * keep their old resolution and object picking drifts once the canvas
	 * changes size. Renderbuffers can be re-storaged in place; the id texture was
	 * created with immutable storage (texStorage2D), so it must be recreated.
	 *
	 * _canvasSize is updated in place so holders of the reference (e.g. the
	 * Picker) keep seeing the current size.
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
	 * Binds the buffers and material associated with a renderable so it can be
	 * drawn. Binding the vertex array object is what actually establishes the
	 * vertex/index buffer bindings and attribute pointers - see
	 * createVertexArray - so this no longer re-issues per-attribute GL calls
	 * every draw.
	 *
	 * @param obj - The renderable to bind
	 */
	bindRenderable(obj: Renderable): void {
		this._gl.bindVertexArray(obj.vertexBuffer.vao);
		this.setMaterial(obj.material);
	}

	/**
	 * Unbinds the vertex array object and shader.
	 */
	unbindRenderable(): void {
		this._gl.bindVertexArray(null);
		this.dropProgram();
	}

	/**
	 * Converts internal VertexTypes to appropriate WebGL type
	 *
	 * @param type - The internal VertexTypes type to be converted
	 * @returns - The WebGL value of the converted type
	 */
	toGLType(type: VertexTypes): number {
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
	getTypeSize(type: VertexTypes): number {
		switch (type) {
			case VertexTypes.FLOAT:
				return 4;
			default:
				throw new Error("Unidentified VertexType!");
		}
	}
}

export { Renderer };
