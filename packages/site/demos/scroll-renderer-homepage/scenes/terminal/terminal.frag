#version 300 es
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;

out vec4 colour;

float hash(float n)  { return fract(sin(n) * 43758.5453); }
float hash(vec2 p)   { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;

  // Faint grid
  vec2  grid = fract(uv * vec2(55.0, 38.0));
  float line = max(smoothstep(0.92, 1.0, grid.x), smoothstep(0.92, 1.0, grid.y));

  // Per-column falling data streams
  float cols    = 55.0;
  float col_idx = floor(uv.x * cols);
  float spd     = 0.35 + hash(col_idx) * 0.75;
  float offset  = hash(col_idx * 3.7);
  float t       = uv.y - u_time * spd + offset;
  float glyph   = hash(vec2(col_idx, floor(t * 22.0)));
  float bright  = smoothstep(0.82, 1.0, fract(t * 22.0)) * step(0.45, glyph);
  float trail   = smoothstep(0.0, 0.5, fract(t * 1.4)) * 0.25;

  vec3 bg       = vec3(0.02, 0.05, 0.03);
  vec3 gridCol  = vec3(0.06, 0.32, 0.22) * line * 0.4;
  vec3 dataCol  = vec3(0.18, 0.88, 0.55) * (bright * 0.75 + trail * 0.35);

  colour = vec4(bg + gridCol + dataCol, 1.0);
}
