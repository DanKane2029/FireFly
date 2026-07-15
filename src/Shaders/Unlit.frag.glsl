#version 300 es
precision mediump float;
precision mediump int;

uniform vec4 u_color;

flat in int v_objectId;

layout(location = 0) out vec4 fragColor;
layout(location = 1) out int objectId;

void main(void) {
	fragColor = u_color;

	// Second render target: write this object's id so this pass stays
	// pickable, same as the lit shader does.
	objectId = v_objectId;
}
