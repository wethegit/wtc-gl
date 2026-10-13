#version 300 es

in vec2 position;

layout(location=0) in vec2 a_position;
layout(location=1) in vec2 a_velocity;
layout(location=2) in vec4 a_properties;

out vec2 v_position;
out vec2 v_velocity;
out vec4 v_properties;
out float v_life;

uniform vec2 u_resolution;
uniform float u_time;

#define MOD3 vec3(.1031,.11369,.13787)
vec3 hash33(vec3 p3) {
  p3 = fract(p3 * MOD3);
  p3 += dot(p3, p3.yxz+19.19);
  return -1.0 + 2.0 * fract(vec3((p3.x + p3.y)*p3.z, (p3.x+p3.z)*p3.y, (p3.y+p3.z)*p3.x));
}
float simplex_noise(vec3 p) {
  const float K1 = 0.333333333;
  const float K2 = 0.166666667;
  vec3 i = floor(p + (p.x + p.y + p.z) * K1);
  vec3 d0 = p - (i - (i.x + i.y + i.z) * K2);
  vec3 e = step(vec3(0.0), d0 - d0.yzx);
  vec3 i1 = e * (1.0 - e.zxy);
  vec3 i2 = 1.0 - e.zxy * (1.0 - e);
  vec3 d1 = d0 - (i1 - 1.0 * K2);
  vec3 d2 = d0 - (i2 - 2.0 * K2);
  vec3 d3 = d0 - (1.0 - 3.0 * K2);
  vec4 h = max(0.6 - vec4(dot(d0,d0), dot(d1,d1), dot(d2,d2), dot(d3,d3)), 0.0);
  vec4 n = h*h*h*h * vec4(dot(d0,hash33(i)), dot(d1,hash33(i+i1)), dot(d2,hash33(i+i2)), dot(d3,hash33(i+1.0)));
  return dot(vec4(31.316), n);
}

void main() {
  v_position = a_position + a_velocity;
  float pos = 1. + smoothstep(.5, .6, a_properties.w) * 10.;
  float a = simplex_noise(vec3(v_position*.05 * a_properties.y * pos, u_time)) * 3.141596 * 2.;
  float wind = simplex_noise(vec3(v_position*.0005, u_time*5.5)) * 3.;

  v_velocity =
    a_velocity *
    (.985 + .01 * a_properties.x) +
    vec2(cos(a), sin(a)) * .1 * a_properties.x * pos * .5 +
    vec2(0.1 * wind, -.08) *
    max(.2, 1. - a_properties.x * (1. + a_properties.w));
  v_position = v_position;

  v_properties = a_properties;
  v_properties.z += 1.;

  float life = smoothstep(100., 0., a_properties.z * a_properties.w);
  v_life = life;

  gl_PointSize = 55. * life * max(.1, 1.3 - a_properties.x);

  vec3 hash = hash33(vec3(a_position, u_time)*2048.);

  if (a_position.y < -10. || life == 0.) {
    float y = abs(hash.z) * u_resolution.y * .5 + u_resolution.y;
    v_position = vec2(u_resolution.x*.5 + hash.x * u_resolution.x * .5, y);
    v_velocity = vec2(0,0);
    v_properties.z = y * .17;
  } else if (a_position.x < -50.) {
    v_position.x = u_resolution.x + 5.;
  } else if (a_position.x > u_resolution.x+50.) {
    v_position.x = -5.;
  }

  gl_Position = vec4(a_position / u_resolution * 2. - 1., 1.-a_properties.x, 1.);
}
