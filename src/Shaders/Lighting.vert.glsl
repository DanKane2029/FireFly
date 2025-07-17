#version 300 es
precision mediump float;

in vec3 a_position;
in vec3 a_normal;
in vec2 a_texCoord;

uniform mat4 u_transform;
uniform mat4 u_perspective;
uniform mat4 u_view;

uniform vec4 u_color;
uniform int u_objectId;

out vec4 v_color;
out vec4 v_position;
out vec2 v_texCoord;
out vec3 v_normal;
flat out int v_objectId;

void main(void) {
	v_color = u_color;
	v_texCoord = a_texCoord;
	v_normal = a_normal;
	v_position = vec4(a_position, 1.0);
	v_objectId = u_objectId;

	gl_Position = u_perspective * u_view * u_transform * vec4(a_position, 1.0);
}
