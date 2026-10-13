#version 300 es
precision highp float;

uniform vec2      u_resolution;
uniform vec2      u_mouse;
uniform float     u_time;
uniform sampler2D u_noise;
uniform sampler2D u_environment;

out vec4 colour;

vec2  movement;
float scale = 5.;
vec2  mouse;

vec2 hash2(vec2 p) {
  return texture(u_noise, (p + 0.5) / 256.0).xy;
}

vec3 tex3D(sampler2D tex, in vec3 p, in vec3 n) {
  n = abs(n);
  p = (texture(tex, p.yz) * n.x + texture(tex, p.zx) * n.y + texture(tex, p.xy) * n.z).xyz;
  return p;
}

float voronoi(vec2 uv) {
  float dist = 4., s_dist = 4., s_result = 0.;
  vec2  grid_id = floor(uv);
  vec2  grid_uv = fract(uv);
  float exponent = 20., result = 0.;

  for (float j = -1.; j < 2.; j++) {
    for (float i = -1.; i < 2.; i++) {
      vec2 offset        = vec2(i, j);
      vec2 grid_test_id  = grid_id + offset;

      vec2 rand      = hash2(grid_test_id + 1000.)*.5;
      // rand           = 0.5 + 0.4 * sin(u_time + 6.2831 * rand);
      vec2 point_pos = offset + rand - grid_uv;

      float len = dot(point_pos, point_pos);
      result += exp(-exponent * len);

      if (len < dist) {
        s_dist    = dist;
        s_result += exp(-exponent * dist);
        dist      = len;
      } else if (len < s_dist) {
        s_dist    = len;
        s_result += exp(-exponent * len);
      }
    }
  }

  return s_dist + .2;
}

float bumpMap(vec2 p) { return voronoi(p); }

float scene(vec3 p) { return 1. - p.z - bumpMap(p.xy); }

vec3 normal(vec3 p) {
  vec2 e = vec2(.004, 0.);
  return normalize(vec3(
    scene(p + e.xyy) - scene(p - e.xyy),
    scene(p + e.yxy) - scene(p - e.yxy),
    scene(p + e.yyx) - scene(p - e.yyx)
  ));
}

vec4 renderPass(vec2 uv) {
  vec3 surfacePos  = vec3(uv, 0.0);
  vec3 ray         = normalize(vec3(uv - movement, 1.));
  vec3 lightPos    = vec3(0., 0., -2.) + vec3(mouse, 0.);

  vec3 n = normal(surfacePos);

  vec3 textureBump = (
    texture(u_noise, surfacePos.xy * vec2(.001, 1.) * .5).rgb +
    texture(u_noise, surfacePos.xy).rgb * .5
  ) * .02;

  n = normalize(n - textureBump);

  vec3  lightV    = lightPos - surfacePos;
  float lightDist = max(length(lightV), 0.001);
  lightV /= lightDist;

  float attenuation = 1. / (1.0 + lightDist * lightDist);
  float diffuse     = smoothstep(.5, 1., max(dot(n, lightV), 0.)) + .3;
  float specular    = pow(max(dot(reflect(-lightV, n), -ray), 0.), 10.) * 10.;

  vec3 env     = tex3D(u_environment, ray + n * .2 + textureBump, n);
  vec3 texCol  = vec3(0., .5, 1.) + env * .2 * 15.;
  vec3 col     = (texCol * diffuse + vec3(.8, .8, 1.) * specular * (1. + n) * 2.) * attenuation * 1.5;

  return vec4(col, 1.);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.y, u_resolution.x);

  float l = smoothstep(.02, .0, length(uv - u_mouse));

  float t = u_time * .5;
  mat2  rot = mat2(cos(t), -sin(t), sin(t), cos(t));

  movement = vec2(u_time * 2.);
  uv       = uv * scale * rot + movement;

  mouse    = u_mouse * scale * rot + movement;

  vec4 render = renderPass(uv);
  render = mix(render * (1. + l * 5.), vec4(1.), l * .1);

  colour = render;
}
