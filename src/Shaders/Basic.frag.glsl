precision mediump float;

varying vec4 v_color;
varying vec4 v_position;
varying vec2 v_texCoord;
uniform vec4 color;

uniform sampler2D texture;

void main(void) {
	gl_FragColor = color;
}
