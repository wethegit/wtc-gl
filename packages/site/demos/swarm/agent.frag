#version 300 es
precision highp float;

in float v_speed;
out vec4 colour;

void main() {
  vec3 slow = vec3(0.16, 0.78, 0.68);
  vec3 fast = vec3(1.0, 0.62, 0.32);
  colour = vec4(mix(slow, fast, smoothstep(0.3, 1.1, v_speed)), 0.9);
}
