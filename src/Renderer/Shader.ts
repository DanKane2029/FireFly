/**
 * The types of Shader programs allowed
 */
enum ShaderType {
	VERTEX,
	FRAGMENT,
}

/**
 * A single GPU shader stage - either a vertex shader (runs per vertex, decides
 * where each vertex lands on screen) or a fragment shader (runs per pixel,
 * decides its color), as GLSL source.
 *
 * Holds no compiled handle: a backend compiles this source and caches the
 * result against this object (see webgl/GLResourceCache.ts), so the same
 * Shader can be compiled by more than one backend.
 */
class Shader {
	private _glsl: string;
	private _type: ShaderType;

	/**
	 * Creates a new Shader program object
	 *
	 * @param glsl - The GLSL source code of the shader stage as a string
	 * @param type - The shader program type
	 */
	constructor(glsl: string, type: ShaderType) {
		this._glsl = glsl;
		this._type = type;
	}

	/**
	 * Get the GLSL source code of the stage as a string
	 */
	get glsl(): string {
		return this._glsl;
	}

	/**
	 * Sets the GLSL source code of the stage as a string
	 */
	set glsl(glsl: string) {
		this._glsl = glsl;
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
	 * Clones the shader object
	 *
	 * @returns - The cloned shader object
	 */
	clone(): Shader {
		const clonedShader: Shader = new Shader(this.glsl, this.type);
		return clonedShader;
	}
}

/**
 * A complete GPU program for drawing a surface, in both shader languages.
 *
 * The two APIs package a program differently, and this class carries both
 * shapes rather than pretending they are the same:
 *
 * - **GLSL** (WebGL) compiles a vertex stage and a fragment stage separately
 *   and links the pair - hence `vertexShader` + `fragmentShader`.
 * - **WGSL** (WebGPU) puts every stage in one module with named entry points,
 *   so it is a single `wgsl` string with `vs_main`/`fs_main` inside it.
 *
 * The two sources are hand-written twins that must stay semantically in step;
 * see src/Shaders/ for the pairs. Neither is generated from the other - a
 * transpiler was rejected as a heavy build dependency whose output nobody
 * could read, in a repo whose whole point is being readable.
 */
class ShaderProgram {
	private _vertexShader: Shader;
	private _fragmentShader: Shader;
	private _wgsl: string | undefined;

	/**
	 * Creates a new shader program
	 *
	 * @param vertexShader - A GLSL shader stage that defines the position of the scene object's vertices
	 * @param fragmentShader - A GLSL shader stage that defines the pixel colors of a rendered scene object
	 * @param wgsl - The WGSL twin of the same program, with `vs_main` and
	 * `fs_main` entry points. Optional: a program without one simply cannot be
	 * drawn by the WebGPU backend, which reports that rather than guessing.
	 */
	constructor(
		vertexShader: Shader,
		fragmentShader: Shader,
		wgsl?: string
	) {
		this._vertexShader = vertexShader;
		this._fragmentShader = fragmentShader;
		this._wgsl = wgsl;
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
	 * Gets the WGSL source of the program, or undefined if it has no WGSL twin.
	 */
	get wgsl(): string | undefined {
		return this._wgsl;
	}

	/**
	 * Sets the WGSL source of the program.
	 */
	set wgsl(wgsl: string | undefined) {
		this._wgsl = wgsl;
	}

	/**
	 * Returns a clone of a shader program object
	 *
	 * @returns - The cloned shader program
	 */
	clone(): ShaderProgram {
		const clonedVertexShader: Shader = this.vertexShader.clone();
		const clonedFragmentShader: Shader = this.fragmentShader.clone();
		const clonedShaderProgram: ShaderProgram = new ShaderProgram(
			clonedVertexShader,
			clonedFragmentShader,
			this.wgsl
		);
		return clonedShaderProgram;
	}
}

export { Shader, ShaderProgram, ShaderType };
