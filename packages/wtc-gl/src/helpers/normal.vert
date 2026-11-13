// Prefixed with the version and defines

in vec3 position;
in vec3 normal;

uniform mat4 u_modelViewMatrix;
uniform mat4 u_projectionMatrix;
uniform mat3 u_normalMatrix;

// View space
out vec3 v_normal;
out vec3 v_position;

void main() {
  vec4 p = u_modelViewMatrix * vec4(position, 1.0);
  v_position = p.xyz;
  v_normal = u_normalMatrix * normal;
  gl_Position = u_projectionMatrix * p;
}
