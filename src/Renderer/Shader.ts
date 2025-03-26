/**
 * The types of Shader programs allowed
 */
enum ShaderType {
	VERTEX,
	FRAGMENT,
}

/**
 * Describes a program that can be run on the GPU to render a material on a scene object
 */
class Shader {
	private _source: string;
	private _shader: WebGLShader;
	private _type: ShaderType;
	private _created: boolean;

	/**
	 * Creates a new Shader program object
	 *
	 * @param source - The source code of the shader program as a string
	 * @param type - The shader program type
	 */
	constructor(source: string, type: ShaderType) {
		this._source = source;
		this._type = type;
		this._created = false;
	}

	/**
	 * Get the source code of the program as a string
	 */
	get source(): string {
		return this._source;
	}

	/**
	 * Sets the source code of the program as a string
	 */
	set source(source: string) {
		this._source = source;
	}

	/**
	 * Get the WebGLShader object
	 */
	get shader(): WebGLShader {
		return this._shader;
	}

	/**
	 * Sets the WebGLShader object
	 */
	set shader(shader: WebGLShader) {
		this._shader = shader;
	}

	/**
	 * Get the shader type
	 */
	get type(): ShaderType {
		return this._type;
	}

	/**
	 * Sets the shader type
	 */
	set type(type: ShaderType) {
		this._type = type;
	}

	/**
	 * Gets the created boolean
	 */
	get created(): boolean {
		return this._created;
	}

	/**
	 * Sets the created boolean
	 */
	set created(created: boolean) {
		this._created = created;
	}

	/**
	 * Clones the shader object
	 *
	 * @returns - The cloned shader object
	 */
	clone(): Shader {
		const clonedShader: Shader = new Shader(this.source, this.type);
		return clonedShader;
	}
}

/**
 * A Vertex and Fragment Shader coupling that is used to render a scene object to the screen
 */
class ShaderProgram {
	private _program: WebGLProgram;
	private _vertexShader: Shader;
	private _fragmentShader: Shader;
	private _created: boolean;

	/**
	 * Creates a new shader program
	 *
	 * @param vertexShader - A shader program that defines the position of the scene object's vertices
	 * @param fragmentShader - A shader program that defines the pixel colors of a rendered scene object
	 */
	constructor(vertexShader: Shader, fragmentShader: Shader) {
		this._vertexShader = vertexShader;
		this._fragmentShader = fragmentShader;
		this._created = false;
	}

	/**
	 * Gets the WebGLProgram object
	 */
	get program(): WebGLProgram {
		return this._program;
	}

	/**
	 * Sets the WebGLProgram object
	 */
	set program(program: WebGLProgram) {
		this._program = program;
	}

	/**
	 * Gets the vertex shader of the program
	 */
	get vertexShader(): Shader {
		return this._vertexShader;
	}

	/**
	 * Sets the vertex shader of the program
	 */
	set vertexShader(vertexShader: Shader) {
		this._vertexShader = vertexShader;
	}

	/**
	 * Gets the fragments shader of the program
	 */
	get fragmentShader(): Shader {
		return this._fragmentShader;
	}

	/**
	 * Sets the fragment shader of the program
	 */
	set fragmentShader(fragmentShader: Shader) {
		this._fragmentShader = fragmentShader;
	}

	/**
	 * Gets the created boolean
	 */
	get created(): boolean {
		return this._created;
	}

	/**
	 * Sets the created boolean
	 */
	set created(created: boolean) {
		this._created = created;
	}

	/**
	 * Clones a shader program object
	 *
	 * @returns - The cloned shader program
	 */
	clone(): ShaderProgram {
		const clonedVertexShader: Shader = this.vertexShader.clone();
		const clonedFragmentShader: Shader = this.fragmentShader.clone();
		const clonedShaderProgram: ShaderProgram = new ShaderProgram(
			clonedVertexShader,
			clonedFragmentShader
		);
		return clonedShaderProgram;
	}
}

export { Shader, ShaderProgram, ShaderType };
