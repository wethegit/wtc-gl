#version 300 es
precision highp float;

uniform vec2  u_resolution;
uniform float u_time;
uniform vec4  u_mouse;  // xy = current, zw = previous
uniform sampler2D b_render;

out vec4 colour;

vec2 screenUV() {
  return (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
}

// Signed distance to line segment a→b
float seg(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float t = clamp(dot(p - a, ab) / dot(ab, ab), 0., 1.);
  return length(p - a - ab * t);
}

vec2 lissajous1(float t) { return vec2(cos(t * 1.0),        sin(t * 2.0 + 0.30)) * 0.46; }
vec2 lissajous2(float t) { return vec2(cos(t * 3.0 + 1.1),  sin(t * 2.0 + 0.70)) * 0.40; }
vec2 lissajous3(float t) { return vec2(cos(t * 2.0 + 2.4),  sin(t * 5.0 + 0.20)) * 0.34; }

vec3 stroke(vec2 uv, vec2 a, vec2 b, vec3 col, float w) {
  float d     = seg(uv, a, b);
  float core  = smoothstep(w, w * 0.2, d)*10.;
  float bloom = smoothstep(w * 4., 0., d) * 0.35;
  return col * (core + bloom);
}

void main() {
  vec2 uv = screenUV();
  float t  = u_time * 22.;
  float dt = 0.08;    // how far back each segment reaches
  float w  = 0.012;   // stroke half-width

  vec3 col = vec3(0.);
  col += stroke(uv, lissajous1(t), lissajous1(t - dt), vec3(1.00, 0.45, 0.15), w);
  col += stroke(uv, lissajous2(t), lissajous2(t - dt), vec3(0.15, 0.65, 1.00), w);
  col += stroke(uv, lissajous3(t), lissajous3(t - dt), vec3(0.80, 0.20, 1.00), w);

  // Mouse draws a segment from previous to current position
  vec2 mouseCur  = (u_mouse.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  vec2 mousePrev = (u_mouse.zw - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  col += stroke(uv, mouseCur, mousePrev, vec3(0.95), w * 1.2);

  // Accumulate: new strokes on top of faded previous frame
  vec3 prev = texture(b_render, gl_FragCoord.xy / u_resolution).rgb;
  colour = vec4(col + prev * 0.974, 1.0);
}
