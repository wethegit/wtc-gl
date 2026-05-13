#version 300 es
precision highp float;

uniform sampler2D u_image;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform float u_time;

in vec2 v_uv;
out vec4 fragColor;

// Rodrigues rotation around the grey axis — pure hue shift with no luminance change.
vec3 hue_shift(vec3 c, float angle) {
  const vec3 k = vec3(0.57735);
  float co = cos(angle);
  return c * co + cross(k, c) * sin(angle) + k * dot(k, c) * (1.0 - co);
}

void main() {
  float aspect = u_resolution.x / u_resolution.y;
  vec2 uvA = vec2(v_uv.x * aspect, v_uv.y);
  vec2 mA  = vec2(u_mouse.x * aspect, u_mouse.y);
  float dist = length(uvA - mA);

  float strength = smoothstep(0.4, 0.0, dist);

  float ripple = sin(dist * 14.0 - u_time * 16.0) * 0.5 + 0.5;
  float angle  = strength * (ripple * 2.0 - 0.5) * 3.14159;

  vec4 col = texture(u_image, v_uv + vec2(cos(angle), sin(angle)) * strength * 0.02);

  col.rgb = hue_shift(col.rgb, angle);

  col.rgb += strength * 0.08;

  fragColor = col;
}
