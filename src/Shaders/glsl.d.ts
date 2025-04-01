/**
 * Used with ts-shader-loader to import GLSL code into TypeScript
 */

declare module "*.glsl" {
	const value: string;
	export default value;
}

declare module "*.vert" {
	const value: string;
	export default value;
}

declare module "*.frag" {
	const value: string;
	export default value;
}
