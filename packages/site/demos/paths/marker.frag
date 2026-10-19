#version 300 es
precision highp float;

in vec3 v_normal;
in vec3 v_view;
in vec3 v_colour;

out vec4 colour;

void main() {
  vec3 n = normalize(v_normal);
  vec3 light = normalize(vec3(-0.45, 0.7, 0.55));
  float diffuse = max(dot(n, light), 0.0);
  colour = vec4(v_colour * (0.55 + 0.5 * diffuse), 1.0);
}
