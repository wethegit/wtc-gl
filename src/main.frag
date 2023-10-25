#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_mouse;
uniform sampler2D s_noise;

uniform sampler2D b_noise;

in vec2 v_uv;

out vec4 colour;

vec2 getScreenSpace() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.y, u_resolution.x);

  return uv;
}

vec2 rot2D (vec2 q, float a) {
  return q * cos(a) + q.yx * sin(a) * vec2 (-1., 1.);
}
#define TAU 6.28318530718
vec2 r2(vec2 q, float a) {
  a*=TAU;
  float c = cos(a);
  float s = sin(a);
  return vec2(c*q.x+s*q.y, c*q.y-s*q.x);
}

void main() {
  vec2 uv = getScreenSpace();

  uv *= 1.;

  vec2 a = abs(uv);
  a = r2(vec2(max(a.x,a.y), min(a.x,a.y)), .0625);
  float id = floor(atan(uv.x,uv.y)*8./TAU+4.)/3.;

  float f = length(a-vec2(.3, 0))-.1*(cos(u_time*20.+id)*.5+.5);
  float m = smoothstep(0., .002, f);

  colour = vec4(vec3(m),1);
}