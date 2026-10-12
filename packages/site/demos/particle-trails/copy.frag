#version 300 es
precision highp float;

// Copies this frame's positions into one block of the history texture
// (drawn with a viewport over just that block)

uniform sampler2D b_position;
uniform vec2 u_offset; // the block's corner, in pixels

out vec4 colour;

void main() {
  colour = texelFetch(b_position, ivec2(gl_FragCoord.xy - u_offset), 0);
}
