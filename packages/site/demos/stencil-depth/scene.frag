#version 300 es
precision highp float;

in vec3 v_normal;
in vec3 v_world;
in vec2 v_uv;

// Two colours blended by height, so each world has its own palette
uniform vec3 u_low;
uniform vec3 u_high;
// 1 for the world seen through the portal
uniform float u_inside;
// 0 final, 1 depth, 2 stencil
uniform int u_mode;

out vec4 colour;

void main() {
  // Stencil view: the portal world in white, everything else dark
  if (u_mode == 2) {
    colour = vec4(vec3(u_inside > 0.5 ? 1.0 : 0.12), 1.0);
    return;
  }

  vec3 n = normalize(v_normal);
  vec3 light = normalize(vec3(0.4, 0.8, 0.3));
  float diffuse = max(dot(n, light), 0.0);
  // Normals face inward on the sky sphere, so light it evenly
  float shade = mix(0.35 + 0.65 * diffuse, 1.0, step(15.0, length(v_world)));

  vec3 base = mix(u_low, u_high, clamp(v_world.y * 0.4 + 0.3, 0.0, 1.0));
  colour = vec4(base * shade, 1.0);
}
