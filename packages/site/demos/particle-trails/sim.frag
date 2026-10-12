#version 300 es
precision highp float;

// One simulation step, writing position and velocity together (the old
// version needed a pass for each). The force field is the original's: a
// spherical swirl that rotates with time, plus a pull back towards the
// centre for particles that stray past 10 units.

uniform sampler2D b_position;
uniform sampler2D b_velocity;
uniform float u_time;
uniform float u_delta;

layout(location = 0) out vec4 positionOut;
layout(location = 1) out vec4 velocityOut;

mat4 rotationMatrix(vec3 axis, float angle) {
  axis = normalize(axis);
  float s = sin(angle);
  float c = cos(angle);
  float oc = 1. - c;
  return mat4(
    oc * axis.x * axis.x + c, oc * axis.x * axis.y - axis.z * s, oc * axis.z * axis.x + axis.y * s, 0.,
    oc * axis.x * axis.y + axis.z * s, oc * axis.y * axis.y + c, oc * axis.y * axis.z - axis.x * s, 0.,
    oc * axis.z * axis.x - axis.y * s, oc * axis.y * axis.z + axis.x * s, oc * axis.z * axis.z + c, 0.,
    0., 0., 0., 1.
  );
}

void main() {
  ivec2 texel = ivec2(gl_FragCoord.xy);
  vec3 position = texelFetch(b_position, texel, 0).xyz;
  vec3 velocity = texelFetch(b_velocity, texel, 0).xyz;

  float tm = u_time;
  float l = max(length(position), 1e-4);

  // the field is read in a frame that spins with time
  vec3 turned = (vec4(position, 1.) * rotationMatrix(
    vec3(sin(tm * 25.), cos(tm * 10.), sin(tm) * cos(tm * 5.)),
    .5 + 10. / l
  )).xyz;
  vec3 spherical = vec3(1. / max(l, .1), atan(turned.y, turned.x), acos(clamp(turned.z / l, -1., 1.)));
  float a = sin(length(spherical.yz) * 5. + tm) * 5.;

  vec3 acceleration = vec3(
    spherical.x * sin(spherical.z) * cos(spherical.y),
    spherical.x * sin(spherical.z) * sin(spherical.y),
    spherical.x * cos(spherical.z)
  ) * a;

  vec3 pull = -normalize(position - acceleration) * smoothstep(10., 40., l) * 2.;

  vec3 vel = velocity * .99 + (acceleration + pull) * .5;
  vec3 pos = position + vel * u_delta * .5;
  // anything that escapes starts again near the centre
  if (length(pos) > 100.) pos = pos / length(pos) * 2.;

  positionOut = vec4(pos, 1.);
  velocityOut = vec4(vel, 1.);
}
