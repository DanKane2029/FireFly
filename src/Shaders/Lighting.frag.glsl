#version 300 es
precision mediump float;
precision mediump int;

#define MAX_LIGHTS 10

// lights
struct Light {
	vec3 pos;
};

uniform Light u_lightList[MAX_LIGHTS];
uniform vec3 u_ambientLight;
uniform int u_numLights;

// vertex attributes
in vec4 v_color;
in vec4 v_position;
in vec2 v_texCoord;
in vec3 v_normal;

flat in int v_objectId;

// material attributes
uniform vec4 u_color;
uniform sampler2D u_texture;

layout(location = 0) out vec4 fragColor;
layout(location = 1) out int objectId;


void main(void) {
	float totalLightValue = 0.0;
	for (int i = 0; i < MAX_LIGHTS; i++) {
		if (i >= u_numLights) {
			break;
		}
		vec3 lightVec = normalize(u_lightList[i].pos - v_position.xyz);
		float lightVal = max(dot(lightVec, v_normal), 0.0);
		totalLightValue += lightVal;
	}
	
	vec3 lightColor = u_color.xyz * totalLightValue;
	fragColor = vec4(lightColor + u_ambientLight, 1);
	// fragColor = vec4(float(v_objectId)/20.0, 0, 0, 1);
	objectId = v_objectId;
}
