// A placeholder: draws each particle where the point cloud started it, so a
// new ParticleSimulation shows something. Your own vertex shader reads each
// particle's current position from the simulation texture at `reference`.
attribute vec3 position;
attribute vec2 reference;

uniform vec2 u_resolution;

varying vec2 v_reference;

void main() {
  v_reference = reference;
  gl_PointSize = 2.;
  gl_Position = vec4(position.xy / u_resolution * 2., 0., 1.);
}
