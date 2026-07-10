#version 300 es

in vec3 position;
in vec3 normal;
in vec2 uv;

uniform mat4 u_viewMatrix;
uniform mat4 u_modelMatrix;
uniform mat4 u_modelViewMatrix;
uniform mat4 u_projectionMatrix;
uniform mat3 u_normalMatrix;

out vec3 vNormal;
out vec3 vPosition;
out vec3 vWorldPosition;
out vec2 vUV;

void main() {
  vNormal = normalize(u_normalMatrix * normal);
  vUV = uv;

  gl_Position = u_projectionMatrix * u_modelViewMatrix * vec4(position, 1.0);

  vWorldPosition = (u_modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vPosition = (u_modelMatrix * vec4(position, 1.0)).xyz;
}
