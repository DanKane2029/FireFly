#version 300 es
precision mediump float;

in vec3 a_position;
in vec3 a_normal;
in vec2 a_texCoord;

uniform mat4 u_transform;
uniform mat4 u_perspective;
uniform mat4 u_view;

// Transforms object-space normals into world space. This is the inverse
// transpose of the model matrix -- using u_transform directly would skew
// normals under non-uniform scale.
uniform mat3 u_normalMatrix;

uniform vec4 u_color;
uniform int u_objectId;

out vec4 v_color;
out vec4 v_position;
out vec2 v_texCoord;
out vec3 v_normal;
flat out int v_objectId;

void main(void) {
	// Move the vertex into world space once and reuse it for both lighting
	// (v_position / v_normal are world-space so they match world-space lights)
	// and the final clip-space position.
	vec4 worldPosition = u_transform * vec4(a_position, 1.0);

	v_color = u_color;
	v_texCoord = a_texCoord;
	v_normal = normalize(u_normalMatrix * a_normal);
	v_position = worldPosition;
	v_objectId = u_objectId;

	gl_Position = u_perspective * u_view * worldPosition;
}
