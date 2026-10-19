#version 300 es
precision highp float;

uniform sampler2D b_image;
uniform float u_transition;

out vec4 colour;

void main() {
  vec3 image = texelFetch(b_image, ivec2(gl_FragCoord.xy), 0).rgb;
  float fade = smoothstep(1., 0., u_transition);
  // brightens as it fades to white
  colour = vec4(mix(vec3(1), image, fade) * (1. + (1. - fade)), 1.);
}
