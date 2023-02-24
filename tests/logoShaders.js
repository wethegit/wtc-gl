const logoV = `#version 300 es

in vec2 position;
in vec2 uv;

out vec2 v_uv;

uniform vec2 u_resolution;
uniform float u_time;
uniform sampler2D u_logo;

void main() {
  v_uv = uv;
  gl_Position = vec4(position / u_resolution, 0., 1.);
}`
const logoF = `#version 300 es
precision highp float;

in vec2 v_uv;

out vec4 color;

uniform float u_time;
uniform sampler2D u_logo;

float tri(in float x){return abs(fract(x)-.5);}
vec3 tri3(in vec3 p){return vec3( tri(p.z+tri(p.y*1.)), tri(p.z+tri(p.x*1.)), tri(p.y+tri(p.x*1.)));}                           

mat2 m2 = mat2( 0.970,  0.242, -0.242,  0.970 );
float triNoise3d(in vec3 p)
{
    float z=1.5;
	float rz = 0.;
    vec3 bp = p;
	for (float i=0.; i<=3.; i++ )
	{
        vec3 dg = tri3(bp*2.)*1.;
        p += (dg+u_time*0.25);

        bp *= 1.8;
		z *= 1.5;
		p *= 1.1;
        p.xz*= m2;
        
        rz+= (tri(p.z+tri(p.x+tri(p.y))))/z;
        bp += 0.14;
	}
	return rz;
}

void main() {
  vec2 uv = v_uv;

  float vignette = length(uv - .5) - smoothstep(0., .3, u_time) + triNoise3d(vec3(uv*.2, u_time*.2+%%seed%%));
  float mask = smoothstep(0., 0.01, vignette);

  vec4 logo = texture(u_logo, uv);
  
  color = mix(
    mix(
      logo,
      vec4(1,.9,.5, 1),
      (smoothstep(-.01, -0.001, vignette) + smoothstep(-.1, -0.01, vignette)*.5)*logo.a
      ),
    mix(
      vec4(0),
      vec4(1,.9,.5, .5),
      (smoothstep(.1, 0.0, vignette))*logo.a
      ),
    mask);
}`

export { logoV, logoF }
