#version 300 es

// A unit quad over the element, stretched vertically to cover any overflow.

in vec3 position;

uniform vec4 u_origin; // .zw element centre in canvas NDC
uniform vec2 u_elementSize; // element size in canvas NDC
uniform float u_stretch; // quad height / element height

void main() {
  vec2 p = position.xy * u_elementSize * vec2(1., u_stretch) + u_origin.zw;
  gl_Position = vec4(p, 0., 1.);
}
