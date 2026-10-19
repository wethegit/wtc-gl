#version 300 es
precision highp float;

// Starting state: particles spread through a ball of radius 5, moving
// outwards. Generated here so there's no data to upload (and so it can be
// regenerated after a lost context).

uniform float u_seed;

layout(location = 0) out vec4 position;
layout(location = 1) out vec4 velocity;

vec3 hash33(vec3 p) {
  p = fract(p * vec3(.1031, .1030, .0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

void main() {
  vec3 h = hash33(vec3(gl_FragCoord.xy, u_seed));
  float phi = h.x * 6.2831853;
  float cosTheta = h.y * 2. - 1.;
  float sinTheta = sqrt(1. - cosTheta * cosTheta);
  // cube root, so the ball is evenly filled rather than bunched at the centre
  float r = 5. * pow(h.z, 1. / 3.);
  vec3 p = r * vec3(sinTheta * cos(phi), sinTheta * sin(phi), cosTheta);

  position = vec4(p, 1.);
  velocity = vec4(p * 2., 1.);
}
