#version 300 es
precision mediump float;

in vec3 a_position;

uniform mat4 u_transform;
uniform mat4 u_perspective;
uniform mat4 u_view;

uniform int u_objectId;

flat out int v_objectId;

void main(void) {
	vec4 worldPosition = u_transform * vec4(a_position, 1.0);
	v_objectId = u_objectId;
	gl_Position = u_perspective * u_view * worldPosition;
}
