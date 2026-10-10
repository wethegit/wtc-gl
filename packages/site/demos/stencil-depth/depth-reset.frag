#version 300 es
precision highp float;

out vec4 colour;

// Push depth back to the far plane wherever the portal is, so the world
// behind the portal plane doesn't hide the world seen through it
void main() {
  gl_FragDepth = 1.0;
  colour = vec4(0.0);
}
