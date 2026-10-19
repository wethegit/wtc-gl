#version 300 es
precision highp float;

// Shows the simulation's position texture in a corner of the screen (drawn
// with a viewport over just that corner). Positions are mapped to colour,
// with ±20 units filling the range.

uniform sampler2D b_position;
uniform vec4 u_rect; // the viewport's corner and size, in pixels

out vec4 colour;

void main() {
  vec2 uv = (gl_FragCoord.xy - u_rect.xy) / u_rect.zw;
  vec3 position = texture(b_position, uv).xyz;
  colour = vec4(clamp(position / 40. + .5, 0., 1.), 1.);
}
