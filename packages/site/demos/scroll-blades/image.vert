#version 300 es
precision highp float;

// Draws the cloth from the simulation's latest positions

in vec2 a_position;  // simulated position [0,1]
in vec2 a_restPos;   // original rest position, used as the texture UV

out vec2 v_uv;

uniform vec4 u_origin;
uniform vec2 u_elementSize;

void main() {
  v_uv = a_restPos;

  // Convert element clip space [-1, 1] → canvas NDC so the cloth can
  // overflow its element bounds (cloth drapes below the image edge).
  vec2 canvas_pos = (a_position * 2. - 1.) * (u_elementSize * 0.5) + u_origin.zw;

  gl_Position = vec4(canvas_pos, 0.0, 1.0);
}
