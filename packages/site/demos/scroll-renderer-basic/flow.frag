#version 300 es
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;

out vec4 colour;

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(dot(hash2(i),           f          ),
        dot(hash2(i+vec2(1,0)), f-vec2(1,0)), u.x),
    mix(dot(hash2(i+vec2(0,1)), f-vec2(0,1)),
        dot(hash2(i+vec2(1,1)), f-vec2(1,1)), u.x),
    u.y);
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float t = u_time * 0.15;

  // Domain-warped fbm for fluid look
  vec2 q = vec2(fbm(uv + t),               fbm(uv + vec2(5.2, 1.3) + t));
  float f = fbm(uv + 3.5 * q + vec2(1.7, 9.2));
  f = f * 0.5 + 0.5;

  vec3 colA = vec3(0.00, 0.38, 0.42);
  vec3 colB = vec3(0.00, 0.72, 0.62);
  vec3 colC = vec3(0.10, 0.95, 0.78);

  vec3 col = mix(mix(colA, colB, smoothstep(0.2, 0.7, f)), colC, smoothstep(0.5, 1.0, f) * 0.5);

  colour = vec4(col, 1.0);
}
