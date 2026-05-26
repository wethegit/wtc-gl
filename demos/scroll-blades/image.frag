#version 300 es
precision highp float;

uniform vec2      u_resolution;
uniform float     u_time;
uniform sampler2D u_image;
uniform vec2      u_imageSize;
uniform float     u_scroll;
uniform vec2      u_mouse; // element-space [0,1], default (0.5, 0.5)

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
  vec2 uv = v_uv;

  // Scroll parallax (Y) + mouse parallax (XY)
  vec2 mouse  = u_mouse - 0.5;
  vec2 offset = vec2(mouse.x * 0.05, (u_scroll - 0.5) * 0.15 + mouse.y * 0.04);
  vec2 imgUV  = coverUV((uv-.5)*1.1+.5, u_resolution, u_imageSize) + offset;
  imgUV = clamp(imgUV, 0.0, 1.0);

  // Chromatic aberration — stronger at edges, zero at centre
  float ca  = 0.004 * (1.0 - length(uv * 2.0 - 1.0) * 0.45);
  vec2  dir = normalize(uv - 0.5 + 1e-4);
  float r   = texture(u_image, imgUV + dir * ca).r;
  float g   = texture(u_image, imgUV).g;
  float b   = texture(u_image, imgUV - dir * ca).b;

  float a = step(imgUV.x, 0.0) + step(1.0, imgUV.x) + step(imgUV.y, 0.0) + step(1.0, imgUV.y);

  vec3 col = mix(vec3(r, g, b), vec3(0), a);

  // Cool editorial grade: pull toward blue, reduce red
  col = mix(col, col * vec3(0.90, 0.95, 1.10), 0.35);

  // Radial vignette
  vec2  c    = uv * 2.0 - 1.0;
  float vign = 1.0 - dot(c, c) * 0.28;
  col *= vign;

  // Noise edge mask — mouse offsets noise sample so erosion pattern shifts with cursor
  vec2 noiseUV = uv * 5.0 + u_time * 0.025 + mouse * 0.8;
  float n = fbm(noiseUV); // ~0 to ~0.97

  // Distance from nearest edge [0 at edge .. 0.5 at centre]
  float edgeDist = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));

  // Noise sets erosion depth per-pixel between 0.05 and 0.15
  float erosion = 0.04 + n * 0.10;
  float mask = smoothstep(erosion - 0.03, erosion + 0.03, edgeDist) * (1.0 - a);

  colour = vec4(col, mask);
}
