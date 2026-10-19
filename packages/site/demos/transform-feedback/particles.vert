#version 300 es

// Draws each particle from the simulation's latest state

in vec2 a_position;
in vec4 a_properties;

out float v_life;

uniform vec2 u_resolution;

void main() {
  float life = smoothstep(100., 0., a_properties.z * a_properties.w);
  v_life = life;

  gl_PointSize = 55. * life * max(.1, 1.3 - a_properties.x);
  gl_Position = vec4(a_position / u_resolution * 2. - 1., 1. - a_properties.x, 1.);
}
