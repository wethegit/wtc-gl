#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform sampler2D s_z;
uniform sampler2D b_p;
uniform sampler2D b_render;
uniform vec2 u_bd;
uniform float u_f;

in vec2 v_uv;

out vec4 colour;


/* Utilities */
/* ---------- */
#define T(x) texture(x, gl_FragCoord.xy / u_resolution )
void main() {
  vec2 uv=gl_FragCoord.xy / u_resolution;
  float d = 16.;

  vec4 sum;
  vec2 px = 1./u_resolution;
  
  float offset[9] = float[](0.0, 1.0, 2.0, 3.0, 4.0, -1.0, -2.0, -3.0, -4.0);
  float weight[9] = float[](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216, 0.1945946, 0.1216216, 0.054054, 0.016216);

  for (int i = 0; i < 9; i++) {
    vec2 samplePos = uv + u_bd * offset[i]*px * d;
    sum += texture(b_render, samplePos) * weight[i];
  }
  colour = sum;
}