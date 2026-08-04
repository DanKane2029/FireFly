/**
 * Lets a .wgsl file be imported as its raw source text.
 *
 * Handled by webpack's `asset/source` type rather than ts-shader-loader (which
 * only knows GLSL extensions) - see the `.wgsl` rule in webpack.config.js.
 */

declare module "*.wgsl" {
	const value: string;
	export default value;
}
