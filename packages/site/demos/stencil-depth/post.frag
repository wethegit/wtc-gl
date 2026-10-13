#version 300 es
precision highp float;

in vec2 v_uv;

uniform sampler2D u_colour;
// The target's DEPTH24_STENCIL8 texture; depth is in the red channel
uniform sampler2D u_depth;
uniform vec2 u_texel;
uniform float u_near;
uniform float u_far;
uniform vec3 u_fog;
// 0 final, 1 depth, 2 stencil
uniform int u_mode;

out vec4 colour;

// Depth texture value to distance from the camera
float linearDepth(vec2 uv) {
  float z = texture(u_depth, uv).r * 2.0 - 1.0;
  return (2.0 * u_near * u_far) / (u_far + u_near - z * (u_far - u_near));
}

void main() {
  vec4 scene = texture(u_colour, v_uv);
  float d = linearDepth(v_uv);

  if (u_mode == 1) {
    // Square root spreads out the near range, where most of the scene is
    colour = vec4(vec3(1.0 - sqrt(d / u_far)), 1.0);
    return;
  }
  if (u_mode == 2) {
    colour = scene;
    return;
  }

  // Outlines where depth jumps relative to distance
  float dx = linearDepth(v_uv + vec2(u_texel.x, 0.0)) -
    linearDepth(v_uv - vec2(u_texel.x, 0.0));
  float dy = linearDepth(v_uv + vec2(0.0, u_texel.y)) -
    linearDepth(v_uv - vec2(0.0, u_texel.y));
  float edge = smoothstep(0.04, 0.12, length(vec2(dx, dy)) / d);

  float fog = smoothstep(6.0, 30.0, d);
  vec3 c = mix(scene.rgb, u_fog, fog);
  c = mix(c, vec3(0.02), edge * (1.0 - fog));
  colour = vec4(c, 1.0);
}
