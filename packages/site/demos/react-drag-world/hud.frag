#version 300 es
precision highp float;

// HUD overlay drawn by a second mesh on top of a region's base shader. Its
// program is `transparent: true, depthTest: false`, which puts it in the
// renderer's UI group so it always draws after the base mesh.

uniform float u_time;
uniform vec2  u_resolution;
uniform vec4  u_origin;

out vec4 colour;

// Anti-aliased line mask: 1 within `t` of 0, fading out over ~1px.
float line(float d, float t) {
  return 1.0 - smoothstep(t - 1.0, t + 1.0, abs(d));
}

// Premultiplied "over" compositing.
vec4 over(vec4 src, vec4 dst) {
  return src + dst * (1.0 - src.a);
}

void main() {
  vec2 res = u_resolution;
  // Element-relative pixels, centred on the element.
  vec2 p = gl_FragCoord.xy - u_origin.xy - 0.5 * res;
  float s = min(res.x, res.y);
  float t = max(1.5, s * 0.004);

  float lines = 0.0;

  // Corner brackets
  float inset = s * 0.06;
  float arm = s * 0.14;
  vec2 c = 0.5 * res - inset - abs(p);
  lines = max(lines, line(c.y, t) * step(-t, c.x) * step(c.x, arm));
  lines = max(lines, line(c.x, t) * step(-t, c.y) * step(c.y, arm));

  // Reticle ring
  float R = s * 0.22;
  float r = length(p);
  lines = max(lines, line(r - R, t));

  // Crosshair ticks with a gap in the middle
  lines = max(lines, line(p.y, t) * step(R * 0.35, abs(p.x)) * step(abs(p.x), R * 1.35));
  lines = max(lines, line(p.x, t) * step(R * 0.35, abs(p.y)) * step(abs(p.y), R * 1.35));

  // Radar sweep inside the ring
  float lag = mod(u_time * 40.0 - atan(p.y, p.x), 6.28318);
  float sweep = exp(-lag * 2.5) * (1.0 - smoothstep(R - 1.0, R + 1.0, r)) * 0.55;

  // Faint scanlines
  float scan = step(0.5, fract(gl_FragCoord.y / 4.0)) * 0.12;

  vec4 col = vec4(0.0, 0.0, 0.0, scan);
  col = over(vec4(vec3(0.35, 1.0, 0.85) * sweep, sweep), col);
  col = over(vec4(vec3(0.96, 0.98, 1.0) * lines * 0.9, lines * 0.9), col);

  // Un-premultiply: the program blends with SRC_ALPHA, ONE_MINUS_SRC_ALPHA.
  colour = vec4(col.rgb / max(col.a, 1e-4), col.a);
}
