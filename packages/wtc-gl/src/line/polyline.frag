// Prefixed with the version and defines

precision highp float;

in float v_distance;
in float v_u;
in float v_side;

uniform vec3 u_colour;
uniform float u_opacity;
uniform float u_alphaTest;
uniform float u_dashArray;
uniform float u_dashRatio;
uniform float u_dashOffset;
uniform float u_visibility;
uniform sampler2D u_map;
// 0 without a map, which leaves u_map a white pixel
uniform float u_useMap;
uniform vec2 u_repeat;
// 1 when the renderer blends premultiplied alpha
uniform float u_premultiplied;

out vec4 colour;

void main() {
  // Drawn on from the start
  if (v_u > u_visibility) discard;

  // Dashes by distance travelled: a dash, then a gap of dashRatio
  if (
    u_dashArray > 0.0 &&
    mod(v_distance + u_dashOffset, u_dashArray) > u_dashArray * (1.0 - u_dashRatio)
  ) discard;

  vec4 c = vec4(u_colour, u_opacity);
  if (u_useMap > 0.5) {
    c *= texture(u_map, vec2(v_u, v_side * 0.5 + 0.5) * u_repeat);
  }
  if (c.a < u_alphaTest) discard;
  if (u_premultiplied > 0.5) c.rgb *= c.a;
  colour = c;
}
