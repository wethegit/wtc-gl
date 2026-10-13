#version 300 es
// A basic webgl frag shader to draw v_c to screen
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;

in vec2 v_uv;
in vec3 v_c;
in vec3 v_pos;

out vec4 colour;

vec2 getScreenSpaceCoords(vec2 uv) {
  return (uv - .5 * u_resolution) / min(u_resolution.x, u_resolution.y);
}
void main() {
  vec2 p = getScreenSpaceCoords(gl_FragCoord.xy);
  colour = vec4(v_c, .3);
}