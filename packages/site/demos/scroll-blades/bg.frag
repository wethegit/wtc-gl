#version 300 es
precision highp float;

uniform vec2  u_resolution;
uniform float u_time;

out vec4 colour;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i),                  hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)),      u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p  = rot * p * 2.1 + vec2(3.71, 1.93);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float t  = u_time * 0.12;

  // Two-level domain warp for rich flowing structure
  vec2 q = vec2(fbm(uv + t), fbm(uv + vec2(5.2, 1.3)));
  vec2 r = vec2(
    fbm(uv + q + vec2(1.7, 9.2) + t * 0.15),
    fbm(uv + q + vec2(8.3, 2.8) + t * 0.20)
  );

  float f = fbm(uv + r);

  // Aurora palette: near-black -> deep navy -> violet -> electric teal
  vec3 col = vec3(0.01, 0.01, 0.04);
  col = mix(col, vec3(0.02, 0.06, 0.28), smoothstep(0.20, 0.45, f));
  col = mix(col, vec3(0.16, 0.02, 0.48), smoothstep(0.42, 0.66, f));
  col = mix(col, vec3(0.02, 0.22, 0.40), smoothstep(0.63, 0.88, f));

  // Glow accent
  col += vec3(0.01, 0.0, 0.02) * f * 5.0;

  colour = vec4(col, 1.0);
}
