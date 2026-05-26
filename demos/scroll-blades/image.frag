#version 300 es
precision highp float;

uniform sampler2D u_image;
uniform vec2      u_imageSize;
uniform vec2      u_resolution;
uniform float     u_time;
uniform vec2      u_mouse;

in vec2 v_uv;
out vec4 colour;

vec2 coverUV(vec2 uv, vec2 cont, vec2 img) {
  float ca = cont.x / cont.y;
  float ia = img.x  / img.y;
  vec2  s  = ca > ia ? vec2(1.0, ia / ca) : vec2(ca / ia, 1.0);
  return s * (uv - 0.5) + 0.5;
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i),                  hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)),      u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p  = rot * p * 2.1 + vec2(3.71, 1.93);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 imgUV = coverUV(v_uv, u_resolution, u_imageSize);
  imgUV = clamp(imgUV, 0.0, 1.0);

  // Chromatic aberration based on rest-UV distance from centre
  float ca  = 0.003 * (1.0 - length(v_uv * 2.0 - 1.0) * 0.45);
  vec2  dir = normalize(v_uv - 0.5 + 1e-4);
  float r   = texture(u_image, imgUV + dir * ca).r;
  float g   = texture(u_image, imgUV).g;
  float b   = texture(u_image, imgUV - dir * ca).b;
  vec3  col = vec3(r, g, b);

  // Editorial grade: pull toward blue
  col = mix(col, col * vec3(0.90, 0.95, 1.10), 0.35);

  // Radial vignette
  vec2  c    = v_uv * 2.0 - 1.0;
  float vign = 1.0 - dot(c, c) * 0.28;
  col *= vign;

  // Noise edge mask — mouse shifts the erosion pattern
  vec2  mouse   = u_mouse - 0.5;
  vec2  noiseUV = v_uv * 5.0 + u_time * 0.025 + mouse * 0.8;
  float n        = fbm(noiseUV);
  float edgeDist = min(min(v_uv.x, 1.0 - v_uv.x), min(v_uv.y, 1.0 - v_uv.y));
  vec2 erosion  = vec2(0.04 + n * 0.10, 0.02 + n * 0.06);
  float mask     = smoothstep(erosion.x - 0.03, erosion.x + 0.03, edgeDist) * .6 + smoothstep(erosion.y - 0.01, erosion.y + 0.01, edgeDist) * .4;

  colour = vec4(col, mask);
}
