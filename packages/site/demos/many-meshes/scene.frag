#version 300 es
precision highp float;

in vec3 v_normal;
in vec3 v_object;

out vec4 colour;

void main() {
  // Colour by distance from the galaxy's centre
  float r = clamp(length(v_object.xz) / 40.0, 0.0, 1.0);
  vec3 core = vec3(1.0, 0.78, 0.45);
  vec3 mid = vec3(0.95, 0.35, 0.55);
  vec3 rim = vec3(0.3, 0.45, 1.0);
  vec3 base = mix(mix(core, mid, smoothstep(0.0, 0.45, r)), rim, smoothstep(0.4, 1.0, r));

  // View-space light from the upper left
  float diffuse = max(dot(normalize(v_normal), normalize(vec3(-0.4, 0.7, 0.6))), 0.0);
  colour = vec4(base * (0.3 + 0.7 * diffuse), 1.0);
}
