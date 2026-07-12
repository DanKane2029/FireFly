/**
 * Lets TypeScript accept `import model from "./thing.obj"`. The webpack
 * `asset/source` rule (see webpack.config.js) inlines the .obj file's raw text
 * as a string, which OBJLoader then parses into a Mesh.
 */

declare module "*.obj" {
	const value: string;
	export default value;
}
