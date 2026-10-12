#version 300 es
precision highp float;

uniform float u_transition; // 0 to 1, fading to white between shots
uniform int u_shape; // 0 flat, 1 tube, 2 tube with a rounded head

in vec3 v_colour;
in float v_t;
in float v_across; // -1 to 1 across the ribbon

out vec4 colour;

// How far the trail can reach from its centre line at v_t, as a fraction of
// its width. The geometry already tapers the tail; this rounds off the head
// over its last stretch, so each trail ends in a teardrop instead of a flat
// edge. It's in trail-length units, so long trails get a longer nose.
float envelope(float t) {
  const float start = .85;
  float h = max(t - start, 0.) / (1. - start);
  return sqrt(1. - h * h);
}

void main() {
  float a = v_across;
  if (u_shape == 2) {
    float e = envelope(v_t);
    if (abs(a) > e) discard;
    // keep the tube's shading round inside the narrower outline
    a /= max(e, 1e-3);
  }

  // tails darken towards the oldest point
  vec3 c = v_colour * (.35 + .65 * v_t);

  if (u_shape > 0) {
    // Shade the ribbon as if it were a cylinder facing the camera: z is how
    // much the surface faces us, with a highlight just off-centre
    float z = sqrt(max(1. - a * a, 0.));
    float highlight = pow(max(1. - abs(a + .35) * 2.5, 0.), 4.) * .45;
    c = c * (.3 + .7 * z) + highlight * (.4 + .6 * v_t);
  }

  float fade = smoothstep(1., 0., u_transition);
  colour = vec4(mix(vec3(1), c, fade), 1.);
}
