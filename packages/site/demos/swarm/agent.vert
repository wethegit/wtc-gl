#version 300 es
precision highp float;

// One instanced arrow per agent, pointing along its velocity. The agent's
// position and velocity are per-instance attributes from the simulation.

in vec2 position;   // the arrow shape, pointing along +x
in vec2 a_position; // per instance
in vec2 a_velocity; // per instance

uniform float u_aspect;

out float v_speed;

void main() {
  float speed = length(a_velocity);
  vec2 dir = speed > 1e-5 ? a_velocity / speed : vec2(1.0, 0.0);
  vec2 p = a_position + mat2(dir.x, dir.y, -dir.y, dir.x) * position * 0.014;

  v_speed = speed;
  gl_Position = vec4(p.x / u_aspect, p.y, 0.0, 1.0);
}
