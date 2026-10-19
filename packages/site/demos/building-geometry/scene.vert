#version 300 es
in vec3 position;
in vec3 normal;
in vec3 color;
// Which ring the vertex belongs to, and the centre of its module
in float ring;
in vec3 pivot;

uniform mat4 u_modelMatrix;
uniform mat4 u_modelViewMatrix;
uniform mat4 u_projectionMatrix;
uniform mat3 u_normalMatrix;
uniform vec3 u_cameraPosition;
// Each ring's grow scale, so the regrow wave animates a single merged mesh
uniform float u_ringScale[32];
// How far modules move out from the centre, as a fraction of their distance
uniform float u_explode;

out vec3 v_normal;
out vec3 v_view;
out vec3 v_colour;

void main() {
  // Grow each module about its own centre, and move the centre out from the
  // middle of the sculpture. Neither changes the normals.
  float scale = u_ringScale[int(ring + 0.5)];
  vec3 p = pivot * (1.0 + u_explode) + (position - pivot) * scale;

  vec4 world = u_modelMatrix * vec4(p, 1.0);
  v_normal = normalize(u_normalMatrix * normal);
  v_view = u_cameraPosition - world.xyz;
  v_colour = color;
  gl_Position = u_projectionMatrix * u_modelViewMatrix * vec4(p, 1.0);
}
