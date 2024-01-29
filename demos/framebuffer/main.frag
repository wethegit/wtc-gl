#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_frame;
uniform vec2 u_mouse;
uniform vec2 u_blurdir;
uniform sampler2D s_noise;
uniform sampler2D b_render;

in vec2 v_uv;

out vec4 colour;

vec2 getScreenSpace() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.y, u_resolution.x);

  return uv;
}
void main() {
  vec2 uv = getScreenSpace();
  
  float scale = 20.;
  vec2 ID = floor(uv*scale);
  vec2 suv = mod(uv*scale, 1.)-.5;
  
  float l = 1.;
  
  if(u_frame <= 1000.) {
    if(ID==vec2(0,0))l=0.;
    else if(ID==vec2(1,0))l=0.;
    else if(ID==vec2(2,0))l=0.;
    else if(ID==vec2(2,1))l=0.;
    else if(ID==vec2(1,2))l=0.;
    l = smoothstep(0., .01, length(uv)-.3);
  } else {
    l = texture(b_render,gl_FragCoord.xy/u_resolution*scale).r;
  }

  float m = u_time*10.;
  float c = smoothstep(0.01,0.,length(uv+vec2(cos(m),sin(m))*.3)-.1);
  
  vec4 t = texture(b_render,floor((gl_FragCoord.xy+scale*.5)/scale)/u_resolution*scale);
  vec4 tr = texture(b_render,gl_FragCoord.xy/u_resolution,10.);
  
  // l = smoothstep(0., .01, length(suv)-.3);
  
  colour = vec4(vec3(l,tr.x,l),1.);
  colour = vec4(vec3(c)*.1+texture(b_render,gl_FragCoord.xy/u_resolution, 5.).rgb*.995,1);
  // colour = texture(s_noise, uv, -1.);
  // colour = a;
}