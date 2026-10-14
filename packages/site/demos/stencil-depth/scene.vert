#version 300 es
in vec3 position;
in vec3 normal;
in vec2 uv;

uniform mat4 u_modelMatrix;
uniform mat4 u_modelViewMatrix;
uniform mat4 u_projectionMatrix;
uniform mat3 u_normalMatrix;

out vec3 v_normal;
out vec3 v_world;
out vec2 v_uv;

void main() {
  v_normal = normalize(u_normalMatrix * normal);
  v_world = (u_modelMatrix * vec4(position, 1.0)).xyz;
  v_uv = uv;
  gl_Position = u_projectionMatrix * u_modelViewMatrix * vec4(position, 1.0);
}
