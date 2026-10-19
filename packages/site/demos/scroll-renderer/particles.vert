#version 300 es
precision highp float;

// Draws each particle from the simulation's latest state

in vec2  a_position;
in float a_life;
in float a_seed;

uniform vec4 u_origin;

out float f_life;
out float f_seed;

void main() {
  f_life = max(0.0, a_life);
  f_seed = a_seed;

  float size = (8.5 + fract(a_seed * 2.3) * 10.0) * smoothstep(0.0, 0.08, f_life);
  gl_PointSize = size;
  gl_Position  = vec4(a_position + u_origin.zw, -.5, 1.0);
}
