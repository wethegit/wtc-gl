#version 300 es
precision highp float;

in vec3 v_normal;
in vec3 v_view;
in vec2 v_uv;

uniform vec3 u_colour;
uniform float u_opacity;
// 1 for stripes around the tube, 0 for a plain colour
uniform float u_stripes;
// 1 for a checker from the uvs, in 0.25-unit squares, to show how they run
uniform float u_checker;

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
  vec3 n = normalize(v_normal) * (gl_FrontFacing ? 1.0 : -1.0);

  // Four stripes around the tube (v) show how the frames twist along it
  float stripe = step(0.5, fract(v_uv.y * 4.0));
  vec3 base = mix(u_colour, u_colour * 0.55, stripe * u_stripes);

  vec2 cell = floor(v_uv * 4.0);
  float check = mod(cell.x + cell.y, 2.0);
  base = mix(base, mix(vec3(0.95), vec3(0.25, 0.27, 0.33), check), u_checker);

  colour = vec4(shade(base, n), u_opacity);
}
