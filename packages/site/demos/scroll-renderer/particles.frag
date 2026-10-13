#version 300 es
precision highp float;

in float f_life;
in float f_seed;

out vec4 colour;

void main() {
  vec2  uv   = gl_PointCoord - 0.5;
  float r    = length(uv) * 2.0;
  float core = 1.0 - smoothstep(0.1, 0.8, r);
  float glow = exp(-r * 2.0) * 0.4;

  vec3 hot  = vec3(0.80, 0.92, 1.00);
  vec3 cool = vec3(0.40 + fract(f_seed * 5.1) * 0.30, 0.10, 0.90);
  vec3 col  = mix(cool, hot, core);

  colour = vec4(col, (core + glow) * smoothstep(0.0, 0.08, f_life));
}
