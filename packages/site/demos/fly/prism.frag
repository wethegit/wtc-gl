// Prefixed with the version, precision and litShading in index.js

uniform mat4 u_viewMatrix;
uniform vec3 u_fogColour;
// Clear up to near, and all fog by far, which is no further than the
// nearest cell that hasn't grown
uniform vec2 u_fog;

in vec3 v_position;
in vec3 v_colour;

out vec4 fragColour;

void main() {
  // Flat faces: the normal from how the position changes across the triangle
  vec3 n = normalize(cross(dFdx(v_position), dFdy(v_position)));
  vec3 view = normalize(-v_position);
  vec3 c = litShade(v_colour, n, view, mat3(u_viewMatrix), 0.25, 24.0);

  // Thickening into the clear colour with distance, so cells of space fade
  // in at the edge rather than appear
  float fog = smoothstep(u_fog.x, u_fog.y, length(v_position));
  fragColour = vec4(mix(c, u_fogColour, fog), 1.0);
}
