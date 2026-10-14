#version 300 es
in vec3 position;
in vec3 normal;

uniform mat4 u_modelViewMatrix;
uniform mat4 u_projectionMatrix;
uniform mat3 u_normalMatrix;
uniform vec3 u_objectPosition;

out vec3 v_normal;
out vec3 v_object;

void main() {
  v_normal = normalize(u_normalMatrix * normal);
  v_object = u_objectPosition;
  gl_Position = u_projectionMatrix * u_modelViewMatrix * vec4(position, 1.0);
}
