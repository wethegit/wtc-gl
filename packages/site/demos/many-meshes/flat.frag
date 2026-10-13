#version 300 es
precision highp float;

uniform vec3 u_colour;

out vec4 colour;

void main() {
  colour = vec4(u_colour, 1.0);
}
