---
aside: false
pageClass: showcase-gallery
---

<script setup>
import { data as demos } from './demos.data'
</script>

# Examples

Full demos built with wtc-gl, each one a page you can open, take apart and adapt. {.lead}

Each demo isolates one or two ideas, from a texture fed by a video to a swarm of icons under physics, and most have a panel of options to play with. The chips on each card are the classes and functions it leans on: pick one to see only the demos that use it.

Four of them have a walkthrough that goes through the source section by section: [Lighting](/showcase/lighting), [Paths](/showcase/paths), [Icon swarm](/showcase/icon-swarm) and [ScrollImage and ScrollHTML](/showcase/scroll-image-cloth). The recipes, [FragmentShader](/recipes/fragment-shader), [ParticleSimulation](/recipes/particle-simulation) and [ScrollRenderer](/recipes/scroll-renderer), have pages of their own.

<DemoGallery
  :demos="demos"
  :walkthroughs="['lighting', 'paths', 'icon-swarm', 'scroll-image-cloth']"
/>
