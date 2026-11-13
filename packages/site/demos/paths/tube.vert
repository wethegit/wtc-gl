#version 300 es
in vec3 position;
in vec3 normal;
in vec2 uv;

uniform mat4 u_modelViewMatrix;
uniform mat4 u_projectionMatrix;
uniform mat3 u_normalMatrix;

out vec3 v_normal;
// View space
out vec3 v_position;
out vec2 v_uv;

void main() {
  vec4 viewPosition = u_modelViewMatrix * vec4(position, 1.0);
  v_normal = normalize(u_normalMatrix * normal);
  v_position = viewPosition.xyz;
  v_uv = uv;
  gl_Position = u_projectionMatrix * viewPosition;
}
