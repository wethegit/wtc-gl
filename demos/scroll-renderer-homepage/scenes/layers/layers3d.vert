#version 300 es
precision highp float;

in vec3 position;
in vec2 uv;

uniform mat4 u_projectionMatrix;
uniform mat4 u_viewMatrix;
uniform mat4 u_modelMatrix;
uniform vec2 u_elementSize;
uniform vec4 u_origin;

out vec2 v_uv;

void main() {
  v_uv = uv;
  vec4 clip = u_projectionMatrix * u_viewMatrix * u_modelMatrix * vec4(position, 1.0);
  // Remap from element-local NDC to canvas NDC so the scene sits over the element
  // while the full canvas clip volume allows rendering to bleed outside it.
  clip.xy = clip.xy * u_elementSize + u_origin.zw;
  gl_Position = clip;
}
