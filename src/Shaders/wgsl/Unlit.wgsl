// The WGSL twin of Unlit.vert.glsl + Unlit.frag.glsl: a flat, solid color that
// ignores the scene's lights, used for the selection outline and the gizmo
// handles. See Lighting.wgsl's header for how a WGSL program differs in shape
// from the GLSL pair.

// Identical to Lighting.wgsl's structs, and to webgpu/UniformLayout.ts. The
// declarations are repeated rather than shared because WGSL has no include
// mechanism - and repeating them is honest about the fact that both programs
// are fed from the very same buffers, with the same bind group layout, so a
// pipeline can be built for either without re-deciding any of it.
struct Frame {
	view: mat4x4f,
	projection: mat4x4f,
	ambient: vec3f,
	numLights: i32,
	lights: array<vec4f, 10>,
};

struct Draw {
	model: mat4x4f,
	normalMatrix: mat3x3f,
	color: vec4f,
	objectId: i32,
};

@group(0) @binding(0) var<uniform> frame: Frame;
@group(1) @binding(0) var<uniform> draw: Draw;

// Only position is read. A pipeline may still feed normal and texCoord - a
// vertex buffer is allowed to carry attributes the shader ignores; what it may
// *not* do is omit one the shader declares.
struct VertexInput {
	@location(0) position: vec3f,
};

struct VertexOutput {
	@builtin(position) clipPosition: vec4f,
};

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
	let worldPosition = draw.model * vec4f(input.position, 1.0);

	var output: VertexOutput;
	output.clipPosition = frame.projection * frame.view * worldPosition;
	return output;
}

struct FragmentOutput {
	@location(0) color: vec4f,
	@location(1) objectId: i32,
};

@fragment
fn fs_main() -> FragmentOutput {
	var output: FragmentOutput;
	output.color = draw.color;
	// Write the id here too, so this pass stays pickable - same as the lit
	// shader, and the reason a gizmo handle can be clicked at all.
	output.objectId = draw.objectId;
	return output;
}
