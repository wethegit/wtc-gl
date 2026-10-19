#version 300 es
precision highp float;

in vec3 v_normal;
in vec3 v_view;
in vec2 v_uv;
in vec3 v_barycentric;

// 0 lit, 1 normals, 2 uv checker
uniform int u_mode;
// 1 to draw each triangle's edges
uniform float u_edges;
uniform vec3 u_colour;

out vec4 colour;

// Lit here until wtc-gl has a built-in lit program: one directional light, a
// sky/ground hemisphere and a soft rim
vec3 shade(vec3 base, vec3 n) {
  vec3 light = normalize(vec3(-0.45, 0.7, 0.55));
  float diffuse = max(dot(n, light), 0.0);
  float hemisphere = n.y * 0.5 + 0.5;
  float rim = pow(1.0 - max(dot(n, normalize(v_view)), 0.0), 3.0);
  return base * (0.42 + 0.6 * diffuse + 0.14 * hemisphere) + rim * 0.1;
}

void main() {
  // Draw the back of open shapes (an open-ended cylinder, a partial sweep)
  // with the normal turned towards the camera
  vec3 n = normalize(v_normal) * (gl_FrontFacing ? 1.0 : -1.0);

  vec3 c;
  if (u_mode == 1) {
    c = n * 0.5 + 0.5;
  } else if (u_mode == 2) {
    // 8 × 8 checks with a red u = 0 edge and a green v = 0 edge, so the seams
    // and the direction of the uvs show
    vec2 cell = floor(v_uv * 8.0);
    float check = mod(cell.x + cell.y, 2.0);
    c = mix(vec3(0.95), vec3(0.25, 0.27, 0.33), check);
    c = mix(c, vec3(0.9, 0.25, 0.25), step(v_uv.x, 0.02));
    c = mix(c, vec3(0.25, 0.75, 0.35), step(v_uv.y, 0.02));
    c = shade(c, n);
  } else {
    c = shade(u_colour, n);
  }

  if (u_edges > 0.5) {
    // Distance to the nearest edge, in pixels
    vec3 d = v_barycentric / fwidth(v_barycentric);
    float edge = 1.0 - smoothstep(0.5, 1.5, min(min(d.x, d.y), d.z));
    c = mix(c, vec3(0.08, 0.08, 0.12), edge * 0.75);
  }

  colour = vec4(c, 1.0);
}
