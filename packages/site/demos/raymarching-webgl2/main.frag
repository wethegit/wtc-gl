#version 300 es
precision highp float;

in vec3 vNormal;
in vec2 vUV;
in vec3 vPosition;
in vec3 vWorldPosition;

out vec4 fragColor;

uniform vec3 u_cameraPosition;
uniform mat4 u_matrix;

/* Raymarching constants */
const float MAX_TRACE_DISTANCE    = 10.;
const float INTERSECTION_PRECISION = 0.001;
const int   NUM_OF_TRACE_STEPS    = 128;
const float STEP_MULTIPLIER       = 0.05;

struct Camera {
  vec3 ro;
  vec3 rd;
  float FOV;
};
struct Surface {
  float len;
  vec3 position;
  vec3 colour;
  float id;
  float steps;
  float AO;
};
struct Model {
  float dist;
  vec3 colour;
  float id;
};

Camera getCamera(in vec3 ro, in vec3 rd, in float FOV) {
  return Camera(ro, rd, FOV);
}

float sdBoxFrame(vec3 p, vec3 b, float e) {
  p = abs(p) - b;
  vec3 q = abs(p + e) - e;
  return min(min(
    length(max(vec3(p.x, q.y, q.z), 0.0)) + min(max(p.x, max(q.y, q.z)), 0.0),
    length(max(vec3(q.x, p.y, q.z), 0.0)) + min(max(q.x, max(p.y, q.z)), 0.0)),
    length(max(vec3(q.x, q.y, p.z), 0.0)) + min(max(q.x, max(q.y, p.z)), 0.0));
}

float sdRoundBox(vec3 p, vec3 b, float r) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}

Model map(vec3 p) {
  // Transform SDF space by the cube's matrix so the repeating pattern rotates with the mesh
  vec3 pos = (vec4(p - vWorldPosition, 1.0) * u_matrix).xyz;
  pos = mod(pos - 0.5, 1.0) - 0.5;
  return Model(
    min(
      sdBoxFrame(pos, vec3(0.35), 0.001) - 0.01,
      sdRoundBox(pos, vec3(0.1), 0.01)
    ),
    vec3(0.5), 0.0);
}

Surface calcIntersection(in Camera cam) {
  float h        = INTERSECTION_PRECISION * 2.0;
  float rayDepth = 0.0;
  float hitDepth = -1.0;
  float id       = -1.0;
  float steps    = 0.0;
  float ao       = 0.0;
  vec3 position;
  vec3 colour;

  for (int i = 0; i < NUM_OF_TRACE_STEPS; i++) {
    if (abs(h) < INTERSECTION_PRECISION || rayDepth > MAX_TRACE_DISTANCE) break;
    position = cam.ro + cam.rd * rayDepth;
    Model m  = map(position);
    h        = m.dist;
    rayDepth += h * STEP_MULTIPLIER;
    id       = m.id;
    steps    += 1.0;
    ao       += max(h, 0.0);
    colour   = m.colour;
  }

  if (rayDepth < MAX_TRACE_DISTANCE) hitDepth = rayDepth;

  return Surface(hitDepth, position, colour, id, steps, ao);
}

void main() {
  Camera cam = getCamera(vPosition, normalize(vPosition - u_cameraPosition), 1.4);

  vec3 n        = normalize(vNormal);
  float lighting = dot(n, normalize(vec3(-0.3, 0.8, 0.6)));
  vec3 colour   = vec3(0.2, 0.8, 1.0) + n * 0.2 + lighting * lighting * 0.3;

  fragColor = vec4(vec3(0.0), 1.0);

  Surface s = calcIntersection(cam);
  fragColor += vec4(0.5, 0.5, 0.9, 1.0) * (1.0 - s.AO * 0.25);

  fragColor.rgb = mix(fragColor.rgb, colour, length(sign(colour) * 0.5));
}
