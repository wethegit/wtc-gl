// Prefixed with the version and defines

// Each normal is a line: both ends share a position and normal, and `side`
// is 0 at the surface and 1 at the tip
in vec3 position;
in vec3 normal;
in float side;

uniform mat4 u_modelViewMatrix;
uniform mat4 u_projectionMatrix;
uniform mat3 u_normalMatrix;
uniform float u_size;

void main() {
  vec4 p = u_modelViewMatrix * vec4(position, 1.0);
  // In view space, so the line is u_size long however the mesh is scaled
  p.xyz += normalize(u_normalMatrix * normal) * u_size * side;
  gl_Position = u_projectionMatrix * p;
  gl_Position.z -= 1e-4 * gl_Position.w;
}
