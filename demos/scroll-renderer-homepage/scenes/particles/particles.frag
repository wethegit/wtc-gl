#version 300 es
precision highp float;

in float f_life;
in float f_seed;
in float f_depth;

out vec4 colour;

void main() {
  vec2  uv   = gl_PointCoord - 0.5;
  float r    = length(uv) * 2.0;
  float core = 1.0 - smoothstep(0.1, 0.8, r);
  float glow = exp(-r * 2.0) * 0.4;

  vec3 hot  = vec3(1, 1, 1.00);
  vec3 cool = vec3(0.10, 0.30 + fract(f_seed * 5.1) * 0.30, 1);
  vec3 col  = mix(cool, hot, core)+.5;

  colour = vec4(col, 1.) * (core + glow) * pow(smoothstep(1., .0, f_life) * smoothstep(0., .2, f_life),2.);
  // colour = vec4(1.) * (core + glow) * pow(smoothstep(1., .0, f_life) * smoothstep(0., .2, f_life),2.);
}
