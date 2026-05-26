#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;  // current position [0,1]
layout(location = 1) in vec2 a_velocity;  // current velocity
layout(location = 2) in vec2 a_restPos;   // original rest position (constant)

// TF-captured — simulation state for next frame
out vec2 v_position;
out vec2 v_velocity;

// Interpolated to fragment — texture UV
out vec2 v_uv;

uniform float u_delta;
uniform float u_scrollVel;
uniform vec2  u_mouse;
uniform vec4 u_origin;
uniform vec2 u_elementSize;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  vec2 pos = a_position;
  vec2 vel = a_velocity;

  float dt = clamp(u_delta * 0.06, 0.5, 3.0);
  float randWeight = 0.5 + hash(a_restPos) * 1.0;

  // Spring toward rest position
  vel += (a_restPos - pos) * 0.07 * dt;

  // Scroll impulse: top leads when scrolling up, bottom leads when scrolling down
  float scrollMag = clamp(abs(u_scrollVel), 0.0, 40.0) * 0.00015;
  float edgeFactor = u_scrollVel > 0.0 ? (1.0 - a_restPos.y) : a_restPos.y;
  vel.y -= sign(u_scrollVel) * scrollMag * edgeFactor * randWeight * dt;

  // Mouse repulsion
  vec2 toVertex = pos - u_mouse;
  float dist = length(toVertex);
  float radius = 0.2;
  if (dist < radius && dist > 0.001) {
    float s = 1.0 - dist / radius;
    vel += normalize(toVertex) * s * s * 0.007 * dt;
  }

  // Damping
  vel *= pow(0.88, dt);

  pos += vel * dt;

  v_position = pos;
  v_velocity = vel;
  v_uv = a_restPos;

  // Convert element clip space [-1, 1] → canvas NDC so the cloth can
  // overflow its element bounds (cloth drapes below the image edge).
  vec2 canvas_pos = (pos * 2. - 1.) * (u_elementSize * 0.5) + u_origin.zw;

  gl_Position = vec4(canvas_pos, 0.0, 1.0);
}
