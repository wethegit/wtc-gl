#version 300 es
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;

out vec4 colour;

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1. + 2. * fract(sin(p) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3. - 2. * f);
  return mix(
    mix(dot(hash2(i),           f          ),
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
  float t = u_time * 18.;

  vec2 q = vec2(fbm(uv + t * .10), fbm(uv + vec2(5.2, 1.3) + t * .12));
  vec2 r = vec2(fbm(uv + 3. * q + vec2(1.7, 9.2) + t * .07),
                fbm(uv + 3. * q + vec2(8.3, 2.8) + t * .05));
  float f = fbm(uv + 3.5 * r) * .5 + .5;

  vec3 c0 = vec3(0.02, 0.03, 0.09);
  vec3 c1 = vec3(0.04, 0.09, 0.22);
  vec3 c2 = vec3(0.08, 0.22, 0.46);
  vec3 c3 = vec3(0.20, 0.50, 0.88);

  vec3 col = mix(c0, c1, smoothstep(0.0, 0.4, f));
  col      = mix(col, c2, smoothstep(0.3, 0.7, f));
  col      = mix(col, c3, smoothstep(0.6, 1.0, f) * 0.55);

  colour = vec4(col, 1.);
}
