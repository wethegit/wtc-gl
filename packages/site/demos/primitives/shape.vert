#version 300 es
in vec3 position;
in vec3 normal;
in vec2 uv;
// (1, 0, 0), (0, 1, 0), (0, 0, 1) on each triangle's corners, for the edges
in vec3 barycentric;

uniform mat4 u_modelViewMatrix;
uniform mat4 u_projectionMatrix;
uniform mat3 u_normalMatrix;

out vec3 v_normal;
// View space
out vec3 v_position;
out vec2 v_uv;
out vec3 v_barycentric;

void main() {
  vec4 viewPosition = u_modelViewMatrix * vec4(position, 1.0);
  v_normal = normalize(u_normalMatrix * normal);
  v_position = viewPosition.xyz;
  v_uv = uv;
  v_barycentric = barycentric;
  gl_Position = u_projectionMatrix * viewPosition;
}
