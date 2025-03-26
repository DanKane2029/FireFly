import { vec4, mat4 } from "gl-matrix";

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
import { Scene } from "./Scene";
import { SceneObject } from "./SceneObject";
import { Camera } from "./Camera";

/**
 * Renders a scene to a WebGL canvas
 */
class Renderer {
	private _gl: WebGL2RenderingContext;
	private _curAnimationRequestId: number;

	/**
	 * Creates a new Renderer
	 *
	 * @param gl - The WebGL2 context to render to
	 */
	constructor(gl: WebGL2RenderingContext) {
		this._gl = gl;
		this._gl.cullFace(this._gl.FRONT_AND_BACK);
	}

	/**
	 * Creates all the buffers, shader programs, and textures for the objects in the scene
	 *
	 * @param scene - The scene to preprocess
	 */
	preprocessScene(scene: Scene): void {
		// creates all the buffers and shader programs for each object in the scene
		scene.objectList.forEach((obj: SceneObject) => {
			if (!obj.vertexBuffer.created) {
				this.createVertexBuffer(obj.vertexBuffer);
			}

			if (!obj.indexBuffer.created) {
				this.createIndexBuffer(obj.indexBuffer);
			}

			if (!obj.material.program.created) {
				this.createShaderProgram(obj.material.program);
			}

			if (!obj.vertexBuffer.layout.created) {
				this.setVertexAttributes(
					obj.material.program,
					obj.vertexBuffer.layout
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

		this.setClearColor(scene.backgroundColor);
		this.enable(this._gl.DEPTH_TEST);
		this._gl.enable(this._gl.BLEND);
		this._gl.blendFunc(this._gl.SRC_ALPHA, this._gl.ONE_MINUS_SRC_ALPHA);
	}

	/**
	 * Draws the scene to the screen
	 *
	 * @param scene - The scene to draw
	 */
	drawScene(scene: Scene): void {
		this.clear(this._gl.COLOR_BUFFER_BIT);

		scene.updateFunction();

		this.preprocessScene(scene);

		const cam: Camera = scene.camera;

		scene.objectList.forEach((obj: SceneObject) => {
			this.bindSceneObject(obj);

			const shaderProgram: ShaderProgram = obj.material.program;
			this.setUniform4Mat(
				shaderProgram,
				"perspective",
				cam.perspectiveMatrix
			);
			this.setUniform4Mat(shaderProgram, "view", cam.viewMatrix);
			this.setUniform4Mat(shaderProgram, "transform", obj.transform);

			this.drawElements(
				this._gl.TRIANGLES,
				obj.indexBuffer.length,
				this._gl.UNSIGNED_INT
			);
			this.unbindSceneObject();
		});
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
	 * Stops drawing the scene
	 */
	stopDrawingScene(): void {
		cancelAnimationFrame(this._curAnimationRequestId);
	}

	/**
	 * Creates a vertex buffer in the WebGL context
	 *
	 * @param buffer - The vertex buffer to create
	 */
	createVertexBuffer(buffer: VertexBuffer): void {
		buffer.buffer = this._gl.createBuffer();
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
	 * Creates a index buffer in the WebGL context
	 *
	 * @param buffer - The index buffer to create
	 */
	createIndexBuffer(buffer: IndexBuffer): void {
		buffer.buffer = this._gl.createBuffer();
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
	 * Creates a shader in the WebGL context
	 *
	 * @param shader - The shader to create
	 */
	createShader(shader: Shader): void {
		const shaderType =
			shader.type === ShaderType.FRAGMENT
				? this._gl.FRAGMENT_SHADER
				: this._gl.VERTEX_SHADER;

		shader.shader = this._gl.createShader(shaderType);
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

		shaderProgram.program = this._gl.createProgram();

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
		const location: WebGLUniformLocation = this._gl.getUniformLocation(
			shaderProgram.program,
			name
		);
		this._gl.uniform1i(location, int);
	}

	/**
	 * Sets an vec4 uniform in a shader program
	 *
	 * @param shaderProgram - The shader program to set the vec4 in
	 * @param name - The name of the vec4 uniform
	 * @param int - The value of the vec4 uniform
	 */
	setUniform4f(shaderProgram: ShaderProgram, name: string, vec4: vec4): void {
		const location: WebGLUniformLocation = this._gl.getUniformLocation(
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
		const location: WebGLUniformLocation = this._gl.getUniformLocation(
			shaderProgram.program,
			name
		);
		this._gl.uniformMatrix4fv(location, false, mat4);
	}

	/**
	 * Defines the vertex attributes in a vertex buffer layout in a shader program
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
		vertexLayout.created = true;
	}

	/**
	 * Creates a texture within the WebGL context
	 *
	 * @param texture - The texture to create
	 */
	createTexture(texture: Texture): void {
		texture.texture = this._gl.createTexture();
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
		texture.loaded = true;
	}

	/**
	 * Gets a material ready to be used in a shader program. It prepares the material properties to be used in the shader program.
	 *
	 * @param material - The material to set to be used in a shader program
	 */
	setMaterial(material: Material) {
		const shaderProgram: ShaderProgram = material.program;
		this.useProgram(shaderProgram);

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
		this._gl.clearColor(color[0], color[1], color[2], color[3]);
	}

	/**
	 * WebGL helper function to set the clear bit. Usually set to COLOR_BUFFER_BIT
	 *
	 * @param flag - The GL value to set the clear value to
	 */
	clear(flag: number): void {
		this._gl.clear(flag);
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
	 * Binds the buffers and material associated with the scene object so it can be rendered
	 *
	 * @param obj - The scene object to bind
	 */
	bindSceneObject(obj: SceneObject): void {
		this.bindVertexBuffer(obj.vertexBuffer);
		this.setVertexAttributes(obj.material.program, obj.vertexBuffer.layout);
		this.bindIndexBuffer(obj.indexBuffer);
		this.setMaterial(obj.material);
	}

	/**
	 * Unbinds all buffers and shaders
	 */
	unbindSceneObject(): void {
		this.unbindVertexBuffer();
		this.unbindIndexBuffer();
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
