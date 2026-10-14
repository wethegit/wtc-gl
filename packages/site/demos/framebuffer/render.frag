#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform sampler2D b_render;

out vec4 colour;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec3 col = texture(b_render, uv).rgb;

  col = col * 1.2 / (col + 1.0);

  vec2 c = uv * 2.0 - 1.0;
  col *= 1.0 - dot(c, c) * 0.28;

  colour = vec4(col, 1.0);
}
