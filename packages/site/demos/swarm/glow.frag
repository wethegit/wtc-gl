#version 300 es
precision highp float;

out vec4 colour;

void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  colour = vec4(0.3, 0.45, 1.0, exp(-r * r * 4.0) * 0.18);
}
