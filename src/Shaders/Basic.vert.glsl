precision mediump float;

attribute vec3 position;
attribute vec2 texCoord;

uniform mat4 transform;
uniform mat4 perspective;
uniform mat4 view;

uniform vec4 color;

varying vec4 v_color;
varying vec4 v_position;
varying vec2 v_texCoord;

void main(void) {
	v_color = color;
	v_texCoord = texCoord;
	v_position = perspective * view * transform * vec4(position, 1.0);
	gl_Position = v_position;
}
