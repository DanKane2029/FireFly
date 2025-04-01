precision mediump float;

#define MAX_LIGHTS 10

uniform mat4 perspective;
uniform mat4 view;

// lights
struct Light {
	vec3 pos;
};

uniform Light lightList[MAX_LIGHTS];
uniform vec3 ambientLight;
uniform int numLights;

// vertex attributes
varying vec4 v_color;
varying vec4 v_position;
varying vec2 v_texCoord;
varying vec3 v_normal;

// material attributes
uniform vec4 color;
uniform sampler2D texture;


void main(void) {
	float totalLightValue = 0.0;
	for (int i = 0; i < MAX_LIGHTS; i++) {
		if (i >= numLights) {
			break;
		}
		vec3 lightVec = normalize(lightList[i].pos - v_position.xyz);
		float lightVal = max(dot(lightVec, v_normal), 0.0);
		totalLightValue += lightVal;
	}
	
	vec3 lightColor = v_color.xyz * totalLightValue;
	gl_FragColor = vec4(lightColor + ambientLight, 1);
}
