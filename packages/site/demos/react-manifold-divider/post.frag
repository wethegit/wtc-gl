#version 300 es
precision highp float;

// Manifold Garden-ish composite of the divider's G-buffer: tinted outlines,
// screen-space AO and depth fog. There's no sky - empty pixels stay
// transparent and fog fades alpha, so the page shows through the band.

uniform sampler2D b_scene;
uniform sampler2D b_normal;
uniform float u_tanFov; // tan(fov / 2), for rebuilding view positions
uniform vec2 u_size; // G-buffer size in physical pixels
uniform vec2 u_offset; // G-buffer bottom-left on the shared canvas
uniform float u_dpr;
uniform float u_fog;
uniform float u_fogStart; // distance before fog begins
uniform float u_premultiplied; // 1 if the canvas expects premultiplied alpha

out vec4 colour;

const float FAR = 1e4;

float D(vec4 s) { return s.a > 0. ? s.a : FAR; }

// view-space position of a texel, from its linear depth
vec3 viewPos(vec2 px, float d) {
  vec2 ndc = px / u_size * 2. - 1.;
  return vec3(ndc * vec2(u_tanFov * u_size.x / u_size.y, u_tanFov) * d, -d);
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  // the quad sits over the element (plus any overflow): work in its pixels
  vec2 px = gl_FragCoord.xy - u_offset;
  ivec2 ip = ivec2(px);
  vec4 s = texelFetch(b_scene, ip, 0);
  float d = D(s);
  bool geom = d < FAR;

  // --- outlines over 8 neighbours, from geometry not colour:
  //   silhouette: one side is empty
  //   crease:     the normals differ
  //   step:       same normal, but the neighbour is off this pixel's plane
  int lw = int(max(1., floor(u_dpr * .85 + .5)));
  vec3 P = viewPos(px, d);
  vec3 n = texelFetch(b_normal, ip, 0).xyz;
  float pixelSize = 2. * u_tanFov * d / u_size.y * float(lw);
  float edge = 0.;
  float dmin = d;
  vec3 ncol = s.rgb;
  for (int k = 0; k < 8; k++) {
    ivec2 o = ivec2(k == 0 || k == 1 || k == 7 ? 1 : k == 3 || k == 4 || k == 5 ? -1 : 0,
                    k == 1 || k == 2 || k == 3 ? 1 : k == 5 || k == 6 || k == 7 ? -1 : 0) * lw;
    ivec2 iq = clamp(ip + o, ivec2(0), ivec2(u_size) - 1);
    vec4 sn = texelFetch(b_scene, iq, 0);
    float dn = D(sn);
    bool ngeom = dn < FAR;
    if (geom != ngeom) {
      edge = 1.;
    } else if (geom) {
      vec3 nn = texelFetch(b_normal, iq, 0).xyz;
      edge = max(edge, smoothstep(.04, .15, 1. - dot(n, nn)));
      vec3 Pn = viewPos(vec2(iq) + .5, dn);
      edge = max(edge, smoothstep(.75, 2.5, abs(dot(Pn - P, n)) / pixelSize));
    }
    if (dn < dmin) {
      dmin = dn;
      ncol = sn.rgb;
    }
  }

  if (dmin >= FAR) {
    colour = vec4(0.);
    return;
  }

  // --- screen-space ambient occlusion
  float ao = 1.;
  if (geom) {
    float occ = 0.;
    // pixels per world unit at depth d (u_tanFov grows with overflow, so
    // the radius stays the same size in the world)
    float rad = u_size.y * .247 / (u_tanFov * (d + 2.));
    float rot = hash(px) * 6.2831;
    for (int k = 0; k < 12; k++) {
      float f = (float(k) + .5) / 12.;
      float a = rot + float(k) * 2.39996;
      vec2 o = vec2(cos(a), sin(a)) * rad * sqrt(f);
      float ds = D(texelFetch(b_scene, clamp(ivec2(px + o), ivec2(0), ivec2(u_size) - 1), 0));
      float diff = d - ds;
      occ += smoothstep(.05, .6, diff) * (1. - smoothstep(2., 6., diff));
    }
    ao = 1. - occ / 12. * .75;
  }

  vec3 lineCol = ncol * vec3(.32, .26, .3);
  vec3 col = geom ? mix(s.rgb * ao, lineCol, edge * .85) : lineCol;
  float alpha = geom ? 1. : edge * .85;

  // --- fog toward transparency (outlines fog with the nearest surface)
  float fog = 1. - exp(-pow(max(dmin - u_fogStart, 0.) / u_fog, 1.6));
  alpha *= 1. - fog;

  colour = vec4(col * mix(1., alpha, u_premultiplied), alpha);
}
