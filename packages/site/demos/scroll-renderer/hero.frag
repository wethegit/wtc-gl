#version 300 es
precision highp float;

uniform float u_time;
uniform vec2 u_resolution;

out vec4 colour;

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  float v  = sin(uv.x * 4.0 + u_time * 40.0);
  v += sin(uv.y * 4.0 + u_time * 52.0);
  v += sin((uv.x + uv.y) * 4.0 + u_time * 28.0);
  v += sin(length(uv) * 8.0 - u_time * 60.0);
  v *= 0.25;

  vec3 col = 0.5 + 0.5 * cos(v * 6.28318 + vec3(0.0, 2.094, 4.189));
  colour = vec4(col, 1.0);
}
