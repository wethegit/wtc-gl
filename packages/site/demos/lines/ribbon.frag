#version 300 es
precision highp float;

// Polyline's own fragment shader, lit with the ribbon's face normal so its
// tilt and banking show. Polyline only adds its defines to its own shaders,
// so the map is left out here.

in float v_distance;
in float v_u;
in float v_side;
in vec3 v_normal;

uniform vec3 u_colour;
uniform float u_opacity;
uniform float u_alphaTest;
uniform float u_dashArray;
uniform float u_dashRatio;
uniform float u_dashOffset;
uniform float u_visibility;

out vec4 colour;

void main() {
  if (v_u > u_visibility) discard;
  if (
    u_dashArray > 0.0 &&
    mod(v_distance + u_dashOffset, u_dashArray) > u_dashArray * (1.0 - u_dashRatio)
  ) discard;

  // Two-sided: the back of the ribbon faces the other way
  vec3 n = normalize(v_normal) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 light = normalize(vec3(-0.45, 0.7, 0.55));
  float diffuse = max(dot(n, light), 0.0);
  float hemisphere = n.y * 0.5 + 0.5;
  // A darker stripe down the middle shows which way the ribbon turns
  float edge = smoothstep(0.75, 0.8, abs(v_side));
  vec3 base = u_colour * mix(1.0, 0.7, 1.0 - edge);

  colour = vec4(base * (0.35 + 0.65 * diffuse + 0.15 * hemisphere), u_opacity);
  if (colour.a < u_alphaTest) discard;
}
