#version 300 es
precision highp float;

uniform vec2      u_resolution;
uniform float     u_time;
uniform vec2      u_mouse;
uniform sampler2D s_noise;
uniform vec3      u_cp;

in vec2 v_uv;
out vec4 c;

/* Shading constants */
const vec3  LP   = vec3(-0.6, 0.7, -0.3);
const vec3  LC   = vec3(.85, 0.80, 0.70);
const vec3  HC1  = vec3(.5, .4, .3);
const vec3  HC2  = vec3(0.1, .1, .6) * .5;
const vec3  HLD  = vec3(0, 1, 0);
const vec3  BC   = vec3(0.25, 0.25, 0.25);
const vec3  FC   = vec3(1.30, 1.20, 1.00);
const float AS   = .5;
const float DS   = 1.;
const float BS   = .3;
const float FS   = .3;

/* Raymarching constants */
const float MAX_TRACE_DISTANCE    = 10.;
const float INTERSECTION_PRECISION = 0.001;
const int   NUM_OF_TRACE_STEPS    = 256;
const float STEP_MULTIPLIER       = .5;

struct Camera {
  vec3  ro;
  vec3  rd;
  vec3  forward;
  vec3  right;
  vec3  up;
  float FOV;
};
struct Surface {
  float len;
  vec3  position;
  vec3  colour;
  float id;
  float steps;
  float AO;
};
struct Model {
  float dist;
  vec3  colour;
  float id;
};

vec2 toScreenspace(in vec2 p) {
  return (p - 0.5 * u_resolution.xy) / min(u_resolution.y, u_resolution.x);
}

mat2 R(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

Camera getCamera(in vec2 uv, in vec3 pos, in vec3 target) {
  vec3  f   = normalize(target - pos);
  vec3  r   = normalize(vec3(f.z, 0., -f.x));
  vec3  u   = normalize(cross(f, r));
  float FOV = .8 + cos(u_time) * .5;
  return Camera(pos, normalize(f + FOV * uv.x * r + FOV * uv.y * u), f, r, u, FOV);
}

float D(vec3 p) { return abs(dot(sin(p.yzx), cos(p.zxy))); }
float O(float f, float s) { return abs(f) - s; }

Model model(vec3 p) {
  p.xz *= R(u_time * 2.);
  p.xy *= R(.3);
  p.x  -= .5;
  p.y  -= .5;
  float d = abs(-(length(vec2(p.y, length(p.xz) - 4.)) - 1.8 + cos(u_time) * .3));
  float g = D(p.yxz * 4. + u_time * 5.) / 4.;
  d = length(vec2(d, g)) - .3;
  return Model(d, vec3(g), 1.);
}

Model map(vec3 p) { return model(p); }

vec3 calcNormal(in vec3 pos) {
  vec3 eps = vec3(.001, 0., 0.);
  return normalize(vec3(
    map(pos + eps.xyy).dist - map(pos - eps.xyy).dist,
    map(pos + eps.yxy).dist - map(pos - eps.yxy).dist,
    map(pos + eps.yyx).dist - map(pos - eps.yyx).dist
  ));
}

Surface march(in Camera cam) {
  float h = 1e4, d = 0., id = -1., s = 0., ao = 0.;
  vec3  p, col;
  for (int i = 0; i < NUM_OF_TRACE_STEPS; i++) {
    if (abs(h) < INTERSECTION_PRECISION || d > MAX_TRACE_DISTANCE) break;
    p   = cam.ro + cam.rd * d;
    Model m = map(p);
    h   = m.dist;
    d  += h * STEP_MULTIPLIER;
    id  = m.id;
    s  += 1.;
    ao += max(h, 0.);
    col = m.colour;
  }
  if (d >= MAX_TRACE_DISTANCE) id = -1.0;
  return Surface(d, p, col, id, s, ao);
}

float softshadow(in vec3 ro, in vec3 rd, in float mint, in float tmax) {
  float res = 1.0, t = mint;
  for (int i = 0; i < 16; i++) {
    float h = map(ro + rd * t).dist;
    res = min(res, 8.0 * h / t);
    t  += clamp(h, 0.02, 0.10);
    if (h < 0.001 || t > tmax) break;
  }
  return clamp(res, 0.0, 1.0);
}

float AO(in vec3 pos, in vec3 nor) {
  float occ = 0.0, sca = 1.0;
  for (int i = 0; i < 5; i++) {
    float hr    = 0.01 + 0.12 * float(i) / 4.0;
    vec3  aopos = nor * hr + pos;
    float dd    = map(aopos).dist;
    occ += -(dd - hr) * sca;
    sca *= 0.95;
  }
  return clamp(1.0 - 3.0 * occ, 0.0, 1.0);
}

vec3 shade(vec3 col, vec3 pos, vec3 nor, vec3 ref, Camera cam) {
  vec3  plp = LP - pos;
  float o   = AO(pos, nor);
  vec3  l   = normalize(plp);
  float d   = clamp(dot(nor, l), 0.0, 1.0) * DS;
  float b   = clamp(dot(nor, normalize(vec3(-l.x, 0., -l.z))), 0.0, 1.0)
              * clamp(1.0 - pos.y, 0.0, 1.0) * BS;
  float f   = pow(clamp(1.0 + dot(nor, cam.rd), 0.0, 1.0), 2.0) * FS;
  vec3  sc  = vec3(0.);
  sc += d * LC;
  sc += mix(HC1, HC2, dot(nor, HLD)) * AS;
  sc += b * BC * o;
  sc += f * FC * o;
  return col * sc;
}

vec3 render(Surface surface, Camera cam, vec2 uv) {
  vec3  colourA = vec3(.35, .5, .75);
  vec3  colourB = vec3(.9, .85, .8);
  vec3  colour  = mix(colourB, colourA, pow(length(uv), 2.) / 1.5);

  if (surface.id > -1.) {
    vec3  n   = calcNormal(surface.position);
    vec3  ref = reflect(cam.rd, n);
    vec3  pos = surface.position;
    float t   = u_time * 10.;
    vec3  col = mix(
      mix(
        vec3(.8, .3, .6),
        vec3(.6, .3, .8),
        cos(length(pos.xy) * 3. + t) * cos(length(pos.yz + 5.) * 1. + t)
          + sin(length(pos.zx) * 10. + 10. + t) * .2 * cos(length(pos.zy))
      ),
      vec3(1.),
      smoothstep(0., .1, cos(surface.colour.r * 40.))
    );
    colour = shade(col, pos, n, ref, cam);
  }
  return colour;
}

void main() {
  vec2    uv      = toScreenspace(gl_FragCoord.xy);
  Camera  cam     = getCamera(uv, u_cp* .01, vec3(10,0,0));
  Surface surface = march(cam);
  c = vec4(render(surface, cam, uv), 1.);
}
