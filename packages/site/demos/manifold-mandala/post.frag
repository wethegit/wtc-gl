#version 300 es
precision highp float;

// Manifold Garden-ish composite: tinted outlines, screen-space AO,
// depth fog into a soft pastel sky with a bright vanishing point.
// Geometry near the camera fades out: a second "behind" layer (the scene with
// everything inside the fade radius discarded) shows through it.

uniform sampler2D b_scene;
uniform sampler2D b_normal;
uniform sampler2D b_behind;
uniform sampler2D b_behindNormal;
uniform vec2 u_nearFade; // inner, outer fade radius around the camera (0 = off)
uniform float u_tanFov; // tan(fov / 2), for rebuilding view positions
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_dpr;
uniform float u_fog;
uniform float u_fogStart; // distance before fog begins
uniform vec3 u_bgA; // centre / cream
uniform vec3 u_bgB; // warm corner
uniform vec3 u_bgC; // cool corner

out vec4 colour;

const float FAR = 1e4;

float D(vec4 s) { return s.a > 0. ? s.a : FAR; }

// view-space position of a texel, from its linear depth
vec3 viewPos(vec2 px, float d) {
  vec2 ndc = px / u_resolution * 2. - 1.;
  return vec3(ndc * vec2(u_tanFov * u_resolution.x / u_resolution.y, u_tanFov) * d, -d);
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

vec3 sky(vec2 px) {
  vec2 uv = px / u_resolution;
  vec2 q = (px - .5 * u_resolution) / u_resolution.y;
  vec3 c = mix(u_bgA, u_bgB, smoothstep(.2, 1.1, (1. - uv.x) * .7 + uv.y * .6));
  c = mix(c, u_bgC, smoothstep(.35, 1.2, uv.x * .5 + (1. - uv.y) * .9) * .7);
  c += vec3(1.) * exp(-length(q) * 4.5) * .35;
  return c;
}

// Shade one layer: outlines, AO and fog. Returns the colour and, in nearest,
// the closest depth around the pixel (outlines spill onto their neighbours,
// so they fade with the surface that drew them).
vec3 shadeLayer(sampler2D scene, sampler2D normals, vec2 px, vec3 bg, out float nearest) {
  ivec2 ip = ivec2(px);
  vec4 s = texelFetch(scene, ip, 0);
  float d = D(s);
  bool geom = d < FAR;

  // --- outlines over 8 neighbours, from geometry not colour:
  //   silhouette: one side is sky
  //   crease:     the normals differ
  //   step:       same normal, but the neighbour is off this pixel's plane
  // Flush faces share a plane and normal, so they never get a line, whatever
  // their tones. Neighbours are exact texels so positions rebuild exactly.
  int lw = int(max(1., floor(u_dpr * .85 + .5)));
  vec3 P = viewPos(px, d);
  vec3 n = texelFetch(normals, ip, 0).xyz;
  float pixelSize = 2. * u_tanFov * d / u_resolution.y * float(lw);
  float edge = 0.;
  float dmin = d;
  vec3 ncol = s.rgb;
  for (int k = 0; k < 8; k++) {
    ivec2 o = ivec2(k == 0 || k == 1 || k == 7 ? 1 : k == 3 || k == 4 || k == 5 ? -1 : 0,
                    k == 1 || k == 2 || k == 3 ? 1 : k == 5 || k == 6 || k == 7 ? -1 : 0) * lw;
    ivec2 iq = clamp(ip + o, ivec2(0), ivec2(u_resolution) - 1);
    vec4 sn = texelFetch(scene, iq, 0);
    float dn = D(sn);
    bool ngeom = dn < FAR;
    if (geom != ngeom) {
      edge = 1.;
    } else if (geom) {
      vec3 nn = texelFetch(normals, iq, 0).xyz;
      edge = max(edge, smoothstep(.04, .15, 1. - dot(n, nn)));
      vec3 Pn = viewPos(vec2(iq) + .5, dn);
      edge = max(edge, smoothstep(.75, 2.5, abs(dot(Pn - P, n)) / pixelSize));
    }
    if (dn < dmin) {
      dmin = dn;
      ncol = sn.rgb;
    }
  }

  // --- screen-space ambient occlusion
  float ao = 1.;
  if (geom) {
    float occ = 0.;
    float rad = u_resolution.y * 1.4 / (d + 2.);
    float rot = hash(px) * 6.2831;
    for (int k = 0; k < 12; k++) {
      float f = (float(k) + .5) / 12.;
      float a = rot + float(k) * 2.39996;
      vec2 o = vec2(cos(a), sin(a)) * rad * sqrt(f);
      float ds = D(texture(scene, (px + o) / u_resolution));
      float diff = d - ds;
      occ += smoothstep(.05, .6, diff) * (1. - smoothstep(2., 6., diff));
    }
    ao = 1. - occ / 12. * .75;
  }

  vec3 col = geom ? s.rgb * ao : bg;
  vec3 lineCol = ncol * vec3(.32, .26, .3);
  col = mix(col, lineCol, edge * .85);

  // --- fog toward the sky (outlines fog with the nearest surface)
  float fog = dmin >= FAR ? 1. : 1. - exp(-pow(max(dmin - u_fogStart, 0.) / u_fog, 1.6));
  col = mix(col, bg, fog);

  nearest = dmin;
  return col;
}

void main() {
  vec2 px = gl_FragCoord.xy;
  vec3 bg = sky(px);

  float near;
  vec3 col = shadeLayer(b_scene, b_normal, px, bg, near);

  // --- near-camera transparency: blend toward the behind layer by the
  // distance (not depth) of the nearest front surface from the camera
  if (u_nearFade.y > 0. && near < FAR) {
    float dist = length(viewPos(px, near));
    float a = smoothstep(u_nearFade.x, u_nearFade.y, dist);
    if (a < 1.) {
      float behindNear;
      vec3 behind = shadeLayer(b_behind, b_behindNormal, px, bg, behindNear);
      col = mix(behind, col, a);
    }
  }

  // --- grade
  vec2 q = (px - .5 * u_resolution) / u_resolution.y;
  col *= 1. - .25 * smoothstep(.4, 1.1, length(q));
  col = mix(vec3(dot(col, vec3(.299, .587, .114))), col, 1.12);
  col += (hash(px + fract(u_time)) - .5) * .025;

  colour = vec4(col, 1.);
}
