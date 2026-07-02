#version 300 es
precision highp float;

in vec2  a_position;
in vec2  a_velocity;
in float a_life;
in float a_seed;

uniform float u_time;
uniform float u_delta;
uniform vec4 u_origin;

// Captured by transform feedback (order must match transformFeedbackVaryings)
out vec2  v_position;
out vec2  v_velocity;
out float v_life;
out float v_seed;

// Passed to fragment only
out float f_life;
out float f_seed;

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(dot(hash2(i + vec2(0,0)), f - vec2(0,0)), dot(hash2(i + vec2(1,0)), f - vec2(1,0)), u.x),
    mix(dot(hash2(i + vec2(0,1)), f - vec2(0,1)), dot(hash2(i + vec2(1,1)), f - vec2(1,1)), u.x), u.y
  );
}

// Divergence-free curl noise — good for smooth particle flow
vec2 curl(vec2 p) {
  const float e = 0.01;
  return vec2(
     noise(p + vec2(0.0, e)) - noise(p - vec2(0.0, e)),
    -(noise(p + vec2(e, 0.0)) - noise(p - vec2(e, 0.0)))
  ) / (2.0 * e);
}

void main() {
  float lifeRate = (0.004 + fract(a_seed * 3.7) * 0.004) * u_delta * 60.0;

  vec2  pos  = a_position;
  vec2  vel  = a_velocity;
  float life = a_life - lifeRate;

  float dt = u_delta * 60.0;
  if (life > 0.0) {
    vec2 force = curl(pos * 2.0 + u_time * 0.12) * 0.0003;
    vel = vel * pow(0.98, dt) + force * dt;
    pos = pos + vel * dt;
  } else {
    // Respawn at centre, random outward burst
    float angle = a_seed * 6.28318 + u_time;
    float speed = 0.002 + fract(a_seed * 7.1) * 0.004;
    vel  = vec2(cos(angle), sin(angle)) * speed;
    pos  = vec2(0.0);
    life = 0.4 + fract(a_seed * 3.1) * 0.6;
  }

  v_position = pos;
  v_velocity = vel;
  v_life     = life;
  v_seed     = a_seed;

  f_life = max(0.0, life);
  f_seed = a_seed;

  float size = (8.5 + fract(a_seed * 2.3) * 10.0) * smoothstep(0.0, 0.08, f_life);
  gl_PointSize = size;
  gl_Position  = vec4(pos+u_origin.zw, -.5, 1.0);
}
