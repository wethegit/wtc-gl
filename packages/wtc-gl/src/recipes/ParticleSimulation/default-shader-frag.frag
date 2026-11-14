// A placeholder: round points, coloured by where each particle's state sits
// in the simulation texture.
precision highp float;

varying vec2 v_reference;

void main() {
  vec2 uv = gl_PointCoord - .5;
  if (length(uv) > .5) discard;
  gl_FragColor = vec4(v_reference, 1., 1.);
}
