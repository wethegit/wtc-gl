#version 300 es
precision highp float;

in vec3  a_position;
in vec3  a_velocity;
in float a_life;
in float a_seed;

uniform float u_time;
uniform float u_delta;
uniform vec4  u_origin;
uniform vec2  u_elementSize;
uniform mat4  u_projectionMatrix;
uniform mat4  u_viewMatrix;
uniform mat4  u_modelMatrix;

out vec3  v_position;
out vec3  v_velocity;
out float v_life;
out float v_seed;

out float f_life;
out float f_seed;
out float f_depth;

vec3 hash3(vec3 p) {
  p = vec3(
    dot(p, vec3(127.1, 311.7,  74.7)),
    dot(p, vec3(269.5, 183.3, 246.1)),
    dot(p, vec3(113.5, 271.9, 124.6))
  );
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453);
}

float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(dot(hash3(i + vec3(0,0,0)), f - vec3(0,0,0)),
            dot(hash3(i + vec3(1,0,0)), f - vec3(1,0,0)), u.x),
        mix(dot(hash3(i + vec3(0,1,0)), f - vec3(0,1,0)),
            dot(hash3(i + vec3(1,1,0)), f - vec3(1,1,0)), u.x), u.y),
    mix(mix(dot(hash3(i + vec3(0,0,1)), f - vec3(0,0,1)),
            dot(hash3(i + vec3(1,0,1)), f - vec3(1,0,1)), u.x),
        mix(dot(hash3(i + vec3(0,1,1)), f - vec3(0,1,1)),
            dot(hash3(i + vec3(1,1,1)), f - vec3(1,1,1)), u.x), u.y),
    u.z);
}

float rand(float seed, float t) {
  return fract(sin(seed * 127.1 + t * 311.7) * 43758.5453);
}

// Curl of three independent noise fields (Bridson's method)
vec3 curl3(vec3 p) {
  const float e = 0.01;
  vec3 p0 = p;
  vec3 p1 = p + vec3(100.0);
  vec3 p2 = p + vec3(200.0);

  float dFz_dy = (noise3(p2 + vec3(0,e,0)) - noise3(p2 - vec3(0,e,0))) * (0.5/e);
  float dFy_dz = (noise3(p1 + vec3(0,0,e)) - noise3(p1 - vec3(0,0,e))) * (0.5/e);
  float dFx_dz = (noise3(p0 + vec3(0,0,e)) - noise3(p0 - vec3(0,0,e))) * (0.5/e);
  float dFz_dx = (noise3(p2 + vec3(e,0,0)) - noise3(p2 - vec3(e,0,0))) * (0.5/e);
  float dFy_dx = (noise3(p1 + vec3(e,0,0)) - noise3(p1 - vec3(e,0,0))) * (0.5/e);
  float dFx_dy = (noise3(p0 + vec3(0,e,0)) - noise3(p0 - vec3(0,e,0))) * (0.5/e);

  return vec3(dFz_dy - dFy_dz, dFx_dz - dFz_dx, dFy_dx - dFx_dy);
}

void main() {
  float lifeRate = (0.004 + fract(a_seed * 4.7) * 0.004) * u_delta * 60.0;

  vec3  pos  = a_position;
  vec3  vel  = a_velocity;
  float life = a_life - lifeRate;

  float dt = u_delta * 60.0;
  if (life > 0.0) {
    vec3 force = curl3(pos * 5.0 + u_time * 0.12) * 0.0001;
    vel = vel * pow(0.98, dt) + force * dt;
    pos = pos + vel * dt;
  } else {
    float angle = rand(a_seed,        u_time) * 6.28318;
    float phi   = rand(a_seed + 17.3, u_time) * 3.14159;
    float speed = 0.004 + rand(a_seed + 31.1, u_time) * 0.002;
    vel  = vec3(sin(phi) * cos(angle), sin(phi) * sin(angle), cos(phi)) * speed;
    pos  = vec3(.2, 0, 0);
    life = 1.;
  }

  v_position = pos;
  v_velocity = vel;
  v_life     = life;
  v_seed     = a_seed;

  f_life = max(0.0, life);
  f_seed = a_seed;

  vec4 clip = u_projectionMatrix * u_viewMatrix * u_modelMatrix * vec4(pos, 1.0);
  f_depth = clamp(1.0 / max(0.001, clip.w), 0.0, 1.0);

  float size = (20.0 + fract(a_seed * 2.3) * 55.0) * smoothstep(0.0, 0.08, f_life) * f_depth * 2.0;
  gl_PointSize = size;

  // Remap from element-local NDC to canvas NDC (elementSpace)
  vec2 ndc = clip.xy / clip.w;
  ndc = ndc * u_elementSize + u_origin.zw;
  // Force z to the near end of the depth range so particles always pass
  // depth testing against 2D scenes from other scroll scenes.
  gl_Position = vec4(ndc * clip.w, -clip.w, clip.w);
}
