#version 300 es
precision highp float;

// Adds the newest tile to the image so far. Pixels already in the
// composition (alpha 1) are kept; empty ones take the tile pass, which is
// transparent everywhere outside the tile.

uniform vec2 u_resolution;
uniform bool u_clearing;

uniform sampler2D b_composition;
uniform sampler2D b_render;

out vec4 fragColor;

void main() {
  vec2 s = gl_FragCoord.xy / u_resolution.xy;

  vec4 composition = texture(b_composition, s);
  vec4 render = texture(b_render, s);

  if (u_clearing) {
    composition = vec4(0);
  }

  fragColor = mix(render, composition, composition.a);
}
