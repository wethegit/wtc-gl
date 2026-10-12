// Default fragment shader for Line
precision highp float;

uniform vec3 u_colour;
uniform float u_opacity;
uniform float u_dashArray; // dash plus gap, in world units; 0 = solid
uniform float u_dashOffset;
uniform float u_dashRatio; // the fraction of each dash that's gap
uniform sampler2D u_map;
uniform float u_useMap;
uniform vec2 u_repeat;
uniform float u_alphaTest;
uniform float u_visibility; // how much of the line is drawn, 0 to 1
uniform float u_premultiplied; // 1 when the renderer uses premultiplied alpha

varying vec2 v_uv;
varying float v_lineDistance;

void main() {
  if (v_uv.x > u_visibility) discard;

  vec4 colour = vec4(u_colour, u_opacity);
  if (u_useMap > .5) colour *= texture2D(u_map, v_uv * u_repeat);

  // Dashes are measured along the distance travelled, so they keep their
  // size as the line grows
  if (u_dashArray > 0.) {
    float d = mod(v_lineDistance + u_dashOffset, u_dashArray);
    if (d > u_dashArray * (1. - u_dashRatio)) discard;
  }

  if (colour.a < u_alphaTest) discard;
  if (u_premultiplied > .5) colour.rgb *= colour.a;
  gl_FragColor = colour;
}
