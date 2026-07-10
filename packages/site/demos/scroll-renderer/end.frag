#version 300 es
precision highp float;

uniform float u_time;
uniform vec2 u_resolution;

out vec4 colour;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;

  vec2 warp = vec2(
    sin(uv.y * 4.0 + u_time * 40.0) * 0.15,
    cos(uv.x * 4.0 + u_time * 32.0) * 0.15
  );

  vec2 grid = fract((uv + warp) * 16.0) - 0.5;
  float d     = length(grid);
  float dot   = 1.0 - smoothstep(0.15, 0.25, d);
  float pulse = sin(u_time * 80.0 - length(uv - 0.5) * 12.0) * 0.5 + 0.5;

  vec3 col = mix(vec3(0.05, 0.4, 0.3), vec3(0.1, 0.9, 0.6), dot * pulse);
  colour = vec4(col, dot * 0.9 + 0.05);
}
