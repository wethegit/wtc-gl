#version 300 es
precision highp float;

// A ribbon of rotating blocks along a winding path, raymarched with eight
// time samples per pixel for motion blur. Far too heavy to draw in one
// frame, so it's rendered a tile at a time (see index.js).

uniform vec2 u_resolution;
uniform float u_time;
uniform sampler2D s_noise;

// These shape the march and sample loops, so they're compile-time
// constants, giving the GPU compiler fixed loops to work with. index.js
// defines them and rebuilds the program when they change.
#ifndef SAMPLES
#define SAMPLES 8 // time samples per pixel, for motion blur
#endif
#ifndef MAX_STEPS
#define MAX_STEPS 512
#endif
#ifndef STEP_SCALE
#define STEP_SCALE .1 // fraction of the distance estimate each step takes
#endif

// From the controls panel (see index.js). The defaults reproduce the
// original sketch.
// camera
uniform float u_shutter; // time between samples
uniform float u_far;
uniform float u_lookAhead; // how far along the path the camera aims
uniform vec2 u_offset; // camera offset from the path
uniform vec3 u_turn; // camera yaw, pitch and roll, in radians
uniform float u_fov;
uniform float u_fovWobble; // the FOV swings by this much with time
uniform float u_aperture; // lens radius; 0 = everything sharp
uniform float u_focus; // distance in front of the camera that's sharp
uniform float u_focusOnLight; // 1 = focus on the light instead
// world
uniform vec2 u_pathAmp; // how far the path swings in x and y
uniform vec2 u_pathFreq;
uniform float u_spacing; // block repeat around the ring
uniform float u_ring; // distance of the blocks from the path
uniform float u_blockHeight;
uniform float u_thickness; // half depth of each slab
uniform float u_wobble; // how far blocks rock
// look
uniform vec3 u_colourA; // blocks are tinted between these two
uniform vec3 u_colourB;
uniform float u_tint; // 0 = the original grey
uniform vec3 u_light; // colour * intensity
uniform float u_lightAhead; // how far along the path the light is
uniform float u_falloff;
uniform float u_lightSize; // radius of the visible light; 0 = hidden
uniform float u_fog;
uniform float u_exposure;

out vec4 fragColor;

vec3 movement = vec3(.0);

const int maxIterations = MAX_STEPS;
const float stopThreshold = 0.002;
const float eps = 0.002;
const vec3 clipColour = vec3(0.);
const vec3 fogColour = vec3(0.);

float mtime;
vec3 lightPos;

struct Surface {
  float distance;
  vec3 position;
  vec3 onsurface_position;
  float steps;
  float fog;
  float id;
};

float opExtrusion( in vec3 p, in float primitive, in float h ) {
    float d = primitive;
    vec2 w = vec2( d, abs(p.z) - h );
    return min(max(w.x,w.y),0.0) + length(max(w,0.0));
}
float sdBox( in vec2 p, in vec2 b ) {
    vec2 d = abs(p)-b;
    return length(max(d,0.0)) + min(max(d.x,d.y),0.0);
}

vec3 path(float z) {
  return vec3(sin(z * u_pathFreq) * u_pathAmp, z);
}

float getBlock(vec3 position, inout int object_id, inout vec3 p) {
  float id = float(object_id);
  float rw = texture(s_noise, vec2((id*2.)/255.)).x;
  float r = sin(rw * 2. + mtime * 20. * rw - id) * u_wobble;
  rw -= .5;
  float s = sin(r);
  float c = cos(r);
  position.xy *= mat2(c, -s, s, c);

  p = position;

  position.y = abs(position.y);
  position.x = mod(position.x, u_spacing) - u_spacing * .5;

  float box = sdBox(position.xy + vec2(0., -u_ring + rw*2.), vec2(u_spacing * .5 + rw, u_blockHeight));
  float world = opExtrusion(position, box, u_thickness) - .05;
  return world;
}

float world(in vec3 position, inout int object_id, inout vec3 p) {

  position.xy -= path(position.z).xy;

  float id = floor(position.z);
  position.z = fract(position.z) - .5;

  int oid1 = int(id);
  vec3 p1;
  float block1 = getBlock(position, oid1, p1);
  int oid2 = int(id+1.);
  vec3 p2;
  float block2 = getBlock(position + vec3(0,0,-1), oid2, p2);
  int oid3 = int(id-1.);
  vec3 p3;
  float block3 = getBlock(position + vec3(0,0,1), oid3, p3);

  object_id = oid1;
  p = p1;

  if(block2 < block1) {
    block1 = block2;
    object_id = oid2;
    p = p2;
  }
  if(block3 < block1) {
    block1 = block3;
    object_id = oid3;
    p = p3;
  }

  return block1;
}
float world(in vec3 position, inout int object_id) {
  vec3 p;
  return world(position, object_id, p);
}
float world(in vec3 position) {
  int dummy = 0;
  return world(position, dummy);
}

Surface getSurface(float rayDepth, vec3 sp, float steps, vec3 onsurface_pos, float fog, float id) {
  return Surface(rayDepth, sp, onsurface_pos, steps, fog, id);
}

Surface rayMarch(vec3 ro, vec3 rd, float start, float end) {
  float sceneDist = 1e4;
  float rayDepth = start;
  int object_id = 0;
  float steps = 0.;
  float fog = 0.;
  vec3 p;
  for(int i = 0; i < maxIterations; i++) {
    sceneDist = world(ro + rd * rayDepth, object_id, p);
    rd += (texture(s_noise, (p.xy)*255.).rgb-.5)*.0005;
    steps++;
    fog += max(sceneDist, 0.);

    if(sceneDist < stopThreshold || rayDepth > end) {
      break;
    }

    rayDepth += sceneDist * STEP_SCALE;
  }

  return getSurface(rayDepth, ro + rd * rayDepth, steps, p, fog, float(object_id));
}

vec3 calculate_normal(in vec3 position) {
  vec3 grad = vec3(
    world(vec3(position.x + eps, position.y, position.z)) - world(vec3(position.x - eps, position.y, position.z)),
    world(vec3(position.x, position.y + eps, position.z)) - world(vec3(position.x, position.y - eps, position.z)),
    world(vec3(position.x, position.y, position.z + eps)) - world(vec3(position.x, position.y, position.z - eps))
  );

  return normalize(grad);
}

vec3 lighting(Surface surface_object, vec3 cam) {

  vec3 sceneColour = vec3(0);

  vec3 normal = calculate_normal(surface_object.position);
  normal += smoothstep(.02, 0., abs(sin(surface_object.onsurface_position.x * 4.))) * .5;
  normal += smoothstep(.01, 0., abs(sin(surface_object.onsurface_position.y * 2.))) * .5;

  vec3 ld = lightPos - surface_object.position;

  float len = length( ld );
  ld = normalize(ld);
  float lightAtten = min( 1.0 / ( u_falloff*len ), 1.0 );
  vec3 reflection_normal = reflect(-ld, normal);

  float ao = (surface_object.steps*.002*(1./(surface_object.fog*.01)));
  ao *= ao*2.;
  ao = clamp(((1.-ao)+.3), 0., 1.);
  float diffuse = max(0., dot(normal, ld));
  float specular = max(0., dot( reflection_normal, normalize(cam - surface_object.position) ));

  vec3 tp = surface_object.onsurface_position * 2.;
  vec3 c = texture(s_noise, tp.xy + tp.zx).rrr + texture(s_noise, tp.zy + tp.yx).rrr;
  tp = surface_object.onsurface_position * vec3(.8, .8, 1.);
  c += texture(s_noise, tp.xy + tp.zx).rrr + texture(s_noise, tp.zy + tp.yx).rrr;
  tp = surface_object.onsurface_position * vec3(1., .4, .4);
  c += texture(s_noise, tp.xy + tp.zx).rrr + texture(s_noise, tp.zy + tp.yx).rrr;
  c *= .125;
  c *= .5 + .5;
  c *=  vec3(1,.98,.90);
  // each block picks its own tint from the noise, like its rotation
  float tintMix = texture(s_noise, vec2((surface_object.id*2.)/255.)).y;
  c *= mix(vec3(1), mix(u_colourA, u_colourB, tintMix), u_tint);
  sceneColour += ( c * (diffuse + specular )) * u_light * lightAtten * ao;

  float fogl = surface_object.fog*u_fog;
  fogl *= smoothstep(-.5, 1.8, fogl);
  sceneColour = mix( sceneColour, fogColour, fogl );

  return sceneColour;
}

// Rotate v by angle a around a unit axis (Rodrigues)
vec3 rotate(vec3 v, vec3 axis, float a) {
  return v * cos(a) + cross(axis, v) * sin(a) + axis * dot(axis, v) * (1. - cos(a));
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

// A point on the unit disk for sample `i`: a golden-angle spiral, turned
// by a per-pixel random so neighbouring pixels don't share a pattern
vec2 lensSample(float i) {
  float r = sqrt((i + .5) / float(SAMPLES));
  float a = i * 2.39996323 + hash(gl_FragCoord.xy) * 6.2831853;
  return r * vec2(cos(a), sin(a));
}

// Glow from the light seen along a ray that travels `hitDistance` before
// hitting something; a light behind a surface doesn't show
vec3 lightGlow(vec3 ro, vec3 rd, float hitDistance) {
  vec3 dir = normalize(rd);
  float t = dot(lightPos - ro, dir);
  if(u_lightSize <= 0. || t < 0. || t > hitDistance) return vec3(0);
  float d = length(ro + dir * t - lightPos) / u_lightSize;
  // a solid core with a soft halo around it
  return u_light * (smoothstep(1., .8, d) * 2. + .15 / (d * d));
}

vec4 mainT(float time, float sampleIndex) {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.y, u_resolution.x);

  mtime = time * 3.;

  movement = path(mtime);
  lightPos = path(mtime + u_lightAhead);

  vec3 lookAt = path(mtime + u_lookAhead);
  vec3 cam = movement + vec3(u_offset, 0.);

  vec3 forward = normalize(lookAt - cam);
  vec3 right = normalize(vec3(forward.z, 0., -forward.x));
  vec3 up = normalize(cross(forward, right));

  // Turn the camera: yaw to the right around up, pitch up around right,
  // then roll around the new forward
  forward = rotate(forward, up, u_turn.x);
  right = rotate(right, up, u_turn.x);
  forward = rotate(forward, right, -u_turn.y);
  up = rotate(up, right, -u_turn.y);
  right = rotate(right, forward, u_turn.z);
  up = rotate(up, forward, u_turn.z);

  float FOV = u_fov + sin(u_time) * u_fovWobble;

  vec3 ro = cam;
  vec3 rd = normalize(forward + FOV * uv.x * right + FOV * uv.y * up);
  rd.y -= (movement.y - lookAt.y) * .04;

  // Depth of field: start each sample from a different point on the lens,
  // aimed through the same point on the focal plane
  if(u_aperture > 0.) {
    float speed = length(rd); // keep the ray's length, which sets its steps
    // a light behind the camera clamps to just in front of it
    float focus = u_focusOnLight > .5 ? max(.1, dot(lightPos - ro, forward)) : u_focus;
    vec3 focal = ro + rd * (focus / dot(rd, forward));
    vec2 lens = lensSample(sampleIndex) * u_aperture;
    ro += right * lens.x + up * lens.y;
    rd = normalize(focal - ro) * speed;
  }

  const float clipNear = 0.;
  float clipFar = u_far;
  Surface objectSurface = rayMarch(ro, rd, clipNear, clipFar);
  bool hit = objectSurface.distance <= clipFar;

  vec3 sceneColour = hit ? lighting(objectSurface, ro) : clipColour;
  float hitDistance = hit ? objectSurface.distance * length(rd) : 1e9;
  sceneColour += lightGlow(ro, rd, hitDistance);

  return vec4(sceneColour, 1.);
}

void main() {
  vec3 colour = vec3(0);
  for(int i = 0; i < SAMPLES; i++) {
    colour += mainT(u_time + u_shutter * float(i), float(i)).rgb;
  }

  // the original summed eight samples and scaled by .07
  fragColor = vec4(colour / float(SAMPLES) * .56 * u_exposure, 1.);
}
