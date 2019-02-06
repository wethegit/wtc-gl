# wtc-gl
A basic Web GL class. Mostly used for simple webgl animations and effects.

## Installation
```
npm install wtc-gl --save
```

## Usage
The following usage is the most basic example.
```
import WTCGL from 'wtc-gl';
console.clear();

const vshader = `
  attribute vec4 a_position;
  
  uniform mat4 u_modelViewMatrix;
  uniform mat4 u_projectionMatrix;
  
  void main() {
    gl_Position = a_position;
  }
`;
const fshader = `
  precision highp float;
  
  uniform vec2 u_resolution;
  uniform float u_time;
  
  #define t u_time
  #define r u_resolution.xy

  void main() {
    vec3 c;
    float l,z=t;
    for(int i=0;i<3;i++) {
      vec2 uv,p=gl_FragCoord.xy/r;
      uv=p;
      p-=.5;
      p.x*=r.x/r.y;
      z+=.07;
      l=length(p);
      uv+=p/l*(sin(z)+1.)*abs(sin(l*9.-z*2.));
      c[i]=.01/length(abs(mod(uv,1.)-.5));
    }
    gl_FragColor=vec4(c/l,t);
  }
`;

const twodWebGL = new WTCGL.default(
  document.querySelector('canvas#webgl'), 
  vshader, 
  fshader,
  window.innerWidth,
  window.innerHeight,
  window.devicePixelRatio
);

window.addEventListener('resize', () => {
  twodWebGL.resize(window.innerWidth, window.innerHeight);
});

twodWebGL.running = true;
```

Here is a more comprehensive example.
<iframe height="265" style="width: 100%;" scrolling="no" title="Codepen Challenge - Primaries" src="//codepen.io/shubniggurath/embed/REOZLY/?height=265&theme-id=0&default-tab=js,result" frameborder="no" allowtransparency="true" allowfullscreen="true">
  See the Pen <a href='https://codepen.io/shubniggurath/pen/REOZLY/'>Codepen Challenge - Primaries</a> by Liam Egan
  (<a href='https://codepen.io/shubniggurath'>@shubniggurath</a>) on <a href='https://codepen.io'>CodePen</a>.
</iframe>

## Documentation
Documentation can be found [here](https://wethegit.github.io/wtc-gl/docs/)