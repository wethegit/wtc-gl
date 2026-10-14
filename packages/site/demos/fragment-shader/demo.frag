#version 300 es
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;

out vec4 colour;

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1. + 2. * fract(sin(p) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3. - 2. * f);
  return mix(
    mix(dot(hash2(i),           f),
        dot(hash2(i+vec2(1,0)), f-vec2(1,0)), u.x),
    mix(dot(hash2(i+vec2(0,1)), f-vec2(0,1)),
        dot(hash2(i+vec2(1,1)), f-vec2(1,1)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0., a = .5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p  = p * 2.1 + vec2(5.2 * float(i), 1.3);
    a *= .48;
  }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - .5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  // Mouse pulls the warp toward the cursor
  vec2 mouse = (u_mouse - .5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float mouseDist = length(uv - mouse);
  float mousePull = exp(-mouseDist * 2.5) * 0.6;

  float t = u_time * 14.;

  vec2 q = vec2(
    fbm(uv + t * .08),
    fbm(uv + vec2(5.2, 1.3) + t * .10)
  );
  q += (mouse - uv) * mousePull;

  vec2 r = vec2(
    fbm(uv + 2.8 * q + vec2(1.7, 9.2) + t * .06),
    fbm(uv + 2.8 * q + vec2(8.3, 2.8) + t * .04)
  );
  float f = fbm(uv + 3. * r) * .5 + .5;

  // Cursor halo — adds a soft teal bloom at the mouse position
  float halo = smoothstep(0.25, 0.0, mouseDist) * 0.35;

  vec3 c0 = vec3(0.02, 0.03, 0.09);
  vec3 c1 = vec3(0.04, 0.09, 0.22);
  vec3 c2 = vec3(0.08, 0.22, 0.46);
  vec3 c3 = vec3(0.20, 0.50, 0.88);
  vec3 cHalo = vec3(0.15, 0.75, 0.85);

  vec3 col = mix(c0, c1, smoothstep(0.0, 0.4, f));
  col      = mix(col, c2, smoothstep(0.3, 0.7, f));
  col      = mix(col, c3, smoothstep(0.6, 1.0, f) * 0.55);
  col      = mix(col, cHalo, halo);

  colour = vec4(col, 1.);
}
