// The WGSL twin of Lighting.vert.glsl + Lighting.frag.glsl. Same lighting
// model, same outputs, expressed the way WebGPU wants it:
//
//   - One module holds both stages, entered at vs_main and fs_main, instead of
//     two separately-compiled sources linked together.
//   - Loose uniforms don't exist. Everything the GLSL version set by name is
//     packed into two uniform buffers whose byte layout is mirrored exactly in
//     webgpu/UniformLayout.ts - keep the two in step.
//   - Attribute slots are numbered, not named. The numbers come from
//     Renderer/attributeLocations.ts, which the WebGL side binds to the same
//     names before linking.

// MUST match MAX_LIGHTS in RenderBackend.ts and in Lighting.frag.glsl.
const MAX_LIGHTS: u32 = 10u;

// Set once per frame: the camera and the lighting environment.
//
// `ambient` is a vec3 but occupies 16 bytes, and `numLights` sits in the 4
// bytes of padding that follow it. Light positions are vec4 because an array
// element in the uniform address space is padded to 16 bytes regardless - the
// w component is unused.
struct Frame {
	view: mat4x4f,
	projection: mat4x4f,
	ambient: vec3f,
	numLights: i32,
	lights: array<vec4f, MAX_LIGHTS>,
};

// Set per object, via a dynamic offset into one buffer holding every draw's
// copy. normalMatrix is the inverse-transpose of model, so normals stay
// perpendicular to the surface under non-uniform scale.
struct Draw {
	model: mat4x4f,
	normalMatrix: mat3x3f,
	color: vec4f,
	objectId: i32,
};

@group(0) @binding(0) var<uniform> frame: Frame;
@group(1) @binding(0) var<uniform> draw: Draw;
@group(2) @binding(0) var albedoTexture: texture_2d<f32>;
@group(2) @binding(1) var albedoSampler: sampler;

struct VertexInput {
	@location(0) position: vec3f,
	@location(1) normal: vec3f,
	@location(2) texCoord: vec2f,
};

struct VertexOutput {
	@builtin(position) clipPosition: vec4f,
	// World space, so it can be compared directly against world-space lights.
	@location(0) worldPosition: vec3f,
	@location(1) normal: vec3f,
	@location(2) texCoord: vec2f,
};

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
	// Move the vertex into world space once and reuse it for both lighting and
	// the final clip-space position.
	let worldPosition = draw.model * vec4f(input.position, 1.0);

	var output: VertexOutput;
	output.worldPosition = worldPosition.xyz;
	output.normal = normalize(draw.normalMatrix * input.normal);
	output.texCoord = input.texCoord;
	output.clipPosition = frame.projection * frame.view * worldPosition;
	return output;
}

// Two render targets, exactly as the GLSL version's two `layout(location = ...)
// out` declarations: the visible image, and the integer id used for GPU
// picking.
struct FragmentOutput {
	@location(0) color: vec4f,
	@location(1) objectId: i32,
};

@fragment
fn fs_main(input: VertexOutput) -> FragmentOutput {
	// Interpolation across the triangle denormalizes the normal, so restore
	// unit length before using it in the lighting dot products.
	let normal = normalize(input.normal);

	// Accumulate Lambert (diffuse) contribution from every light. Both the
	// surface position and the light positions are in world space.
	var totalLightValue = 0.0;
	for (var i = 0u; i < MAX_LIGHTS; i = i + 1u) {
		if (i >= u32(frame.numLights)) {
			break;
		}
		let lightVec = normalize(frame.lights[i].xyz - input.worldPosition);
		totalLightValue = totalLightValue + max(dot(lightVec, normal), 0.0);
	}

	// Sampled unconditionally: a material with no texture of its own still has
	// a 1x1 white pixel bound here (see WebGPUBackend's default texture), so
	// this multiply is a no-op rather than needing a "has a texture" branch.
	let albedo =
		draw.color.rgb * textureSample(albedoTexture, albedoSampler, input.texCoord).rgb;

	var output: FragmentOutput;
	output.color = vec4f(albedo * totalLightValue + frame.ambient, draw.color.a);
	output.objectId = draw.objectId;
	return output;
}
