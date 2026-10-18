#version 300 es
in vec3 position;
in vec3 normal;
in vec2 uv;
// (1, 0, 0), (0, 1, 0), (0, 0, 1) on each triangle's corners, for the edges
in vec3 barycentric;

uniform mat4 u_modelMatrix;
uniform mat4 u_modelViewMatrix;
uniform mat4 u_projectionMatrix;
uniform mat3 u_normalMatrix;
uniform vec3 u_cameraPosition;

out vec3 v_normal;
out vec3 v_view;
out vec2 v_uv;
out vec3 v_barycentric;

void main() {
  vec4 world = u_modelMatrix * vec4(position, 1.0);
  v_normal = normalize(u_normalMatrix * normal);
  v_view = u_cameraPosition - world.xyz;
  v_uv = uv;
  v_barycentric = barycentric;
  gl_Position = u_projectionMatrix * u_modelViewMatrix * vec4(position, 1.0);
}
