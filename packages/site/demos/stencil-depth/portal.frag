#version 300 es
precision highp float;

in vec2 v_uv;

// 0 draws the disc (the stencil mask), 1 draws the ring around it
uniform float u_ring;

out vec4 colour;

void main() {
  float r = length(v_uv - 0.5);
  if (u_ring < 0.5) {
    if (r > 0.45) discard;
  } else if (r < 0.45 || r > 0.5) {
    discard;
  }
  colour = vec4(1.0, 0.85, 0.5, 1.0);
}
