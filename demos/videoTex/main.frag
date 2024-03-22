#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_mouse;
uniform sampler2D s_noise;
uniform sampler2D s_smoke;

in vec2 v_uv;

out vec4 colour;

vec2 getScreenSpace() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / u_resolution.y;

  return uv;
}
void main() {
  vec2 uv = getScreenSpace();
  
  uv *= 1.;
  
  vec3 c = texture(s_smoke, uv-.5).rgb;
  c *= .8-uv.y;

  colour = vec4(1)*c.x;
  // colour = vec4(.5);
}