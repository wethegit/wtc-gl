#version 300 es
precision highp float;

// The simulation draws nothing, but a program still needs a fragment shader
out vec4 colour;

void main() {
  colour = vec4(0.);
}
