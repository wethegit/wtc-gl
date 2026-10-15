#version 300 es
precision highp float;

// A soft glow under each agent, drawn as points from the same simulation
// output as the arrows, by a different program.

in vec2 a_position;

uniform float u_aspect;
uniform float u_pointSize;

void main() {
  gl_PointSize = u_pointSize;
  gl_Position = vec4(a_position.x / u_aspect, a_position.y, 0.0, 1.0);
}
