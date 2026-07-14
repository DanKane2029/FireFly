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
	// Interpolation across the triangle denormalizes the normal, so restore
	// unit length before using it in the lighting dot products.
	vec3 normal = normalize(v_normal);

	// Accumulate Lambert (diffuse) contribution from every light. Both the
	// surface position and the light positions are in world space.
	float totalLightValue = 0.0;
	for (int i = 0; i < MAX_LIGHTS; i++) {
		if (i >= u_numLights) {
			break;
		}
		vec3 lightVec = normalize(u_lightList[i].pos - v_position.xyz);
		float lightVal = max(dot(lightVec, normal), 0.0);
		totalLightValue += lightVal;
	}

	vec3 lightColor = u_color.xyz * totalLightValue;
	fragColor = vec4(lightColor + u_ambientLight, u_color.a);

	// Second render target: write this object's id for GPU picking.
	objectId = v_objectId;
}
