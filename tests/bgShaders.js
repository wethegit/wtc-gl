const bgV = `#version 300 es

in vec2 position;
in vec2 uv;

out vec2 v_uv;

uniform vec2 u_resolution;
uniform float u_time;

void main() {
  v_uv = uv;
  gl_Position = vec4(position / u_resolution * 2., 0., 1.);
}`
const bgF = `#version 300 es
precision highp float;

in vec2 v_uv;

out vec4 color;

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
  vec2 uv = v_uv;

  float a = simplex_noise(vec3(v_uv*vec2(10., 4.)-vec2(0., u_time*5.), u_time*3.));
  a += simplex_noise(vec3(v_uv*vec2(5., 2.)+a*.5-vec2(0., u_time*3.), u_time*3.));
  a *= .5; 
  float s = sin(a);
  float c = cos(a);

  uv += vec2(.1, 0) * mat2(c, -s, s, c);
  
  float vignette = length(uv-.5);
  // color = vec4( 0.122, 0.365, 0.306, 1. );
  color = vec4(
    mix(
      mix(
        vec3( 0.122, 0.365, 0.306 ),
        vec3( 0.114, 0.141, 0.133 ),
        vignette),
      vec3(0),
      vignette*vignette*3.
      ),
      1.);
}`

export { bgV, bgF }
