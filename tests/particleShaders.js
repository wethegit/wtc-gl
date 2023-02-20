const particleCloudV = `#version 300 es

in vec2 position;

layout(location=0) in vec2 a_position;
layout(location=1) in vec2 a_velocity;
layout(location=2) in vec4 a_properties;

out vec2 v_position;
out vec2 v_velocity;
out vec4 v_properties;

uniform vec2 u_resolution;
uniform float u_time;

out float o_angle;
out float o_roundness;
out vec2 o_position;
out float o_life;
out mat2 o_rot;

// Grab from https://www.shadertoy.com/view/4djSRW
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
    
    // thx nikita: https://www.shadertoy.com/view/XsX3zB
    vec3 e = step(vec3(0.0), d0 - d0.yzx);
	vec3 i1 = e * (1.0 - e.zxy);
	vec3 i2 = 1.0 - e.zxy * (1.0 - e);
    
    vec3 d1 = d0 - (i1 - 1.0 * K2);
    vec3 d2 = d0 - (i2 - 2.0 * K2);
    vec3 d3 = d0 - (1.0 - 3.0 * K2);
    
    vec4 h = max(0.6 - vec4(dot(d0, d0), dot(d1, d1), dot(d2, d2), dot(d3, d3)), 0.0);
    vec4 n = h * h * h * h * vec4(dot(d0, hash33(i)), dot(d1, hash33(i + i1)), dot(d2, hash33(i + i2)), dot(d3, hash33(i + 1.0)));
    
    return dot(vec4(31.316), n);
}

void main() {
  v_position = a_position + a_velocity;
  float a = simplex_noise(vec3(v_position*.05 * a_properties.y, u_time)) * 3.141596 + 3.141596 * .5;
  float wind = simplex_noise(vec3(v_position*.0005, u_time*5.5)) * 3.;
  
  v_velocity = 
    a_velocity * 
    (.98 + .01 * a_properties.x) + 
    vec2(cos(a), sin(a)) * .1 * a_properties.x + 
    vec2(0.1 * wind, .1) * 
    a_properties.x * (1. + a_properties.w);
  v_position = v_position;

  v_properties = a_properties;
  v_properties.z += 1.;

  

  float life = smoothstep(300., -50., a_properties.z * a_properties.w);

  o_angle = atan(a_velocity.x, a_velocity.y);
  float s = sin(o_angle);
  float c = cos(o_angle);
  o_rot = mat2(c, s, -s, c);
  o_roundness = life;
  o_position = a_position / u_resolution * 2. - 1.;
  o_life = life * smoothstep(0., 100., a_properties.z);
  
  gl_PointSize = life * 100. * a_properties.w;

  if(a_properties.w > .99) {
    gl_PointSize = life * 800. * a_properties.w;
    o_roundness = 1.;
    o_life = max(0., smoothstep(100. + 200. * a_properties.x * a_properties.y, 0., a_properties.z) - .5);
    if(o_life == 0.) {
      vec3 hash = hash33(vec3(v_position, u_time)*1024.);
      v_position = vec2(-200. + hash.x * (u_resolution.x+200.), -400.);
      v_velocity = vec2(0,0);
      v_properties.z = 0.;
    }
  } else if(v_position.y > u_resolution.y + 10.) {
    vec3 hash = hash33(vec3(v_position, u_time)*1024.);
    v_position = vec2(-100. + hash.x * (u_resolution.x+200.), -100.);
    v_velocity = vec2(0,0);
    v_properties.z = 0.;
  }

  gl_Position = vec4(o_position, 0., 1.);
}`
const particleCloudF = `#version 300 es
precision highp float;

in float o_angle;
in float o_roundness;
in vec2 o_position;
in float o_life;
in mat2 o_rot;

out vec4 color;

uniform vec2 u_resolution;
uniform float u_time;

// Grab from https://www.shadertoy.com/view/4djSRW
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
    
    // thx nikita: https://www.shadertoy.com/view/XsX3zB
    vec3 e = step(vec3(0.0), d0 - d0.yzx);
	vec3 i1 = e * (1.0 - e.zxy);
	vec3 i2 = 1.0 - e.zxy * (1.0 - e);
    
    vec3 d1 = d0 - (i1 - 1.0 * K2);
    vec3 d2 = d0 - (i2 - 2.0 * K2);
    vec3 d3 = d0 - (1.0 - 3.0 * K2);
    
    vec4 h = max(0.6 - vec4(dot(d0, d0), dot(d1, d1), dot(d2, d2), dot(d3, d3)), 0.0);
    vec4 n = h * h * h * h * vec4(dot(d0, hash33(i)), dot(d1, hash33(i + i1)), dot(d2, hash33(i + i2)), dot(d3, hash33(i + 1.0)));
    
    return dot(vec4(31.316), n);
}

void main() {
  vec2 uv = gl_PointCoord.xy - .5;

  uv *= o_rot;
  uv += step(o_roundness, 0.9) * (simplex_noise(vec3(uv*1.5+o_position*2.2, u_time*2.1)) * .08 - .04);
  uv *= vec2(1. + 10. * (1.-o_roundness), 1);
  
  float opacity = clamp(smoothstep(.5, o_roundness*.25, length(uv)), 0., 1.);
  float blur = clamp(smoothstep(.5, 0., length(uv)), 0., 1.);
  
  color = vec4(
    mix(
      mix(
        vec3(1., .6, .0),
        mix(
          vec3(1., 1., .5),  
          vec3(1),
          min(1., blur * 2.)
        ),
      blur),
      vec3(0),
      1.-o_life),
    opacity);
}`

export { particleCloudV, particleCloudF }