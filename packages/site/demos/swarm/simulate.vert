#version 300 es
precision highp float;

// Advances each agent by one step. Runs with rasterisation off: the outputs
// are captured (interleaved into one buffer) and read back next step.
//
// Each agent only sees its own state, so rather than true boids every agent
// chases the shared target on its own orbit, pushed around by a flow field.

in vec2  a_position;
in vec2  a_velocity;
in float a_seed; // constant per agent, so a static attribute

out vec2 v_position;
out vec2 v_velocity;

uniform vec2  u_target;
uniform float u_time;
uniform float u_dt;
uniform float u_aspect;

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(dot(hash2(i + vec2(0, 0)), f - vec2(0, 0)), dot(hash2(i + vec2(1, 0)), f - vec2(1, 0)), u.x),
    mix(dot(hash2(i + vec2(0, 1)), f - vec2(0, 1)), dot(hash2(i + vec2(1, 1)), f - vec2(1, 1)), u.x), u.y
  );
}

// A well-mixed hash: nearby seeds give unrelated values. Deriving traits as
// fract(seed * k) instead keeps them continuous in the seed, so agents with
// nearby seeds settle onto the same path and the swarm collapses into strands.
float hash1(float x) {
  return fract(sin(x * 91.3458) * 47453.5453);
}

// Divergence-free, so the flow swirls rather than bunching agents up
vec2 curl(vec2 p) {
  const float e = 0.01;
  return vec2(
     noise(p + vec2(0.0, e)) - noise(p - vec2(0.0, e)),
    -(noise(p + vec2(e, 0.0)) - noise(p - vec2(e, 0.0)))
  ) / (2.0 * e);
}

void main() {
  float agility  = mix(1.5, 4.0, hash1(a_seed + 1.0));
  float maxSpeed = mix(0.5, 1.1, hash1(a_seed + 2.0));
  // sqrt spreads the orbits evenly over the disc rather than bunching inside
  float orbit    = mix(0.05, 0.45, sqrt(hash1(a_seed + 3.0)));
  float spin     = mix(0.6, 1.6, hash1(a_seed + 4.0)) * (hash1(a_seed + 5.0) > 0.5 ? 1.0 : -1.0);
  float phase    = hash1(a_seed + 6.0) * 6.28318;
  // Each agent reads the flow field somewhere different, so neighbours
  // aren't pushed identically and don't merge
  float flowOffset = hash1(a_seed + 7.0) * 64.0;
  float wobble     = hash1(a_seed + 8.0) * 6.28318;

  // Seek a point circling the target, on an orbit that breathes in and out
  float angle = phase + u_time * spin;
  float radius = orbit * (1.0 + 0.35 * sin(u_time * 0.7 + wobble));
  vec2 goal = u_target + vec2(cos(angle), sin(angle)) * radius;
  vec2 toGoal = goal - a_position;
  float dist = length(toGoal);
  vec2 desired = dist > 0.0 ? toGoal / dist * maxSpeed * min(1.0, dist * 4.0) : vec2(0.0);

  vec2 steer = (desired - a_velocity) * agility;
  vec2 flow = curl(a_position * 1.5 + u_time * 0.1 + flowOffset) * 0.6;

  vec2 vel = a_velocity + (steer + flow) * u_dt;
  float speed = length(vel);
  if (speed > maxSpeed) vel *= maxSpeed / speed;

  vec2 pos = a_position + vel * u_dt;
  pos = clamp(pos, vec2(-u_aspect, -1.0) * 1.1, vec2(u_aspect, 1.0) * 1.1);

  v_position = pos;
  v_velocity = vel;
}
