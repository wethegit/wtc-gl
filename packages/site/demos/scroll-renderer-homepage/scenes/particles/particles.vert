#version 300 es
precision highp float;

// Draws each particle from the simulation's latest state

in vec3  a_position;
in float a_life;
in float a_seed;

uniform vec4  u_origin;
uniform vec2  u_elementSize;
uniform mat4  u_projectionMatrix;
uniform mat4  u_viewMatrix;
uniform mat4  u_modelMatrix;

out float f_life;
out float f_seed;
out float f_depth;

void main() {
  f_life = max(0.0, a_life);
  f_seed = a_seed;

  vec4 clip = u_projectionMatrix * u_viewMatrix * u_modelMatrix * vec4(a_position, 1.0);
  f_depth = clamp(1.0 / max(0.001, clip.w), 0.0, 1.0);

  float size = (20.0 + fract(a_seed * 2.3) * 55.0) * smoothstep(0.0, 0.08, f_life) * f_depth * 2.0;
  gl_PointSize = size;

  // Remap from element-local NDC to canvas NDC (elementSpace)
  vec2 ndc = clip.xy / clip.w;
  ndc = ndc * u_elementSize + u_origin.zw;
  // Force z to the near end of the depth range so particles always pass
  // depth testing against 2D scenes from other scroll scenes.
  gl_Position = vec4(ndc * clip.w, -clip.w, clip.w);
}
