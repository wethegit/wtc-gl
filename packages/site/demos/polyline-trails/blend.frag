#version 300 es
precision highp float;

// Mixes the new frame into the last one, for a little motion smear.
// texelFetch at integer pixels, so feeding the result back in can't drift.

uniform sampler2D b_frame;
uniform sampler2D b_previous;
uniform float u_smear; // how much of the last frame stays

out vec4 colour;

void main() {
  ivec2 texel = ivec2(gl_FragCoord.xy);
  vec4 frame = clamp(texelFetch(b_frame, texel, 0), 0., 1.);
  vec4 previous = texelFetch(b_previous, texel, 0);
  colour = clamp(mix(frame, previous, u_smear), 0., 1.);
}
