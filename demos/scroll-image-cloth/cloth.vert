#version 300 es

in vec3 position;
in vec2 uv;

uniform vec4 u_origin;
uniform vec2 u_elementSize;

out vec2 v_uv;

void main() {
  v_uv = uv;
  // Convert element clip space [-1, 1] → canvas NDC so the cloth can
  // overflow its element bounds (cloth drapes below the image edge).
  vec2 canvas_pos = position.xy * (u_elementSize * 0.5) + u_origin.zw;
  gl_Position = vec4(canvas_pos, 0.0, 1.0);
}
