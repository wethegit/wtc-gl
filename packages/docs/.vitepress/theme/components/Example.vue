<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * A live wtc-gl example, from `examples/<src>.js`. The module's default
 * export takes the element to draw into and returns the example:
 *
 *   export default function (container) {
 *     // set up, append a canvas to container
 *     return { frame(time, delta) {}, resize(width, height) {}, dispose() {} }
 *   }
 *
 * The example is only made once it's near the viewport, only animates while
 * it's on screen, and is disposed of (losing its WebGL context) once it's
 * far away, so a page of examples stays under the browser's context limit.
 */
interface ExampleInstance {
  frame?(time: number, delta: number): void
  resize?(width: number, height: number): void
  dispose(): void
}
type Setup = (container: HTMLElement) => ExampleInstance

const props = withDefaults(
  defineProps<{ src: string; height?: number; demo?: string }>(),
  { height: 360, demo: undefined }
)

const modules = import.meta.glob<{ default: Setup }>('../../../examples/*.js')

const root = ref<HTMLElement>()
const stage = ref<HTMLElement>()
const status = ref<'idle' | 'loading' | 'running' | 'error' | 'unsupported'>(
  'idle'
)
const message = ref('')
const paused = ref(false)

let instance: ExampleInstance | null = null
let creating: Promise<void> | null = null
let visible = false
let raf = 0
let elapsed = 0
let last = 0
let resizeObserver: ResizeObserver | null = null
let near: IntersectionObserver | null = null
let far: IntersectionObserver | null = null

const reducedMotion = () =>
  typeof matchMedia !== 'undefined' &&
  matchMedia('(prefers-reduced-motion: reduce)').matches

const tick = (now: number) => {
  raf = requestAnimationFrame(tick)
  const delta = last ? Math.min((now - last) / 1000, 0.1) : 0
  last = now
  elapsed += delta
  instance?.frame?.(elapsed, delta)
}

const start = () => {
  if (raf || paused.value || !instance) return
  last = 0
  raf = requestAnimationFrame(tick)
}
const stop = () => {
  cancelAnimationFrame(raf)
  raf = 0
}

const create = async () => {
  if (instance || creating || !stage.value) return
  if (typeof WebGL2RenderingContext === 'undefined') {
    status.value = 'unsupported'
    return
  }
  const load = modules[`../../../examples/${props.src}.js`]
  if (!load) {
    status.value = 'error'
    message.value = `No example called ${props.src}`
    return
  }
  status.value = 'loading'
  creating = (async () => {
    try {
      const { default: setup } = await load()
      if (!stage.value) return
      instance = setup(stage.value)
      const { width, height } = stage.value.getBoundingClientRect()
      instance.resize?.(width, height)
      // One frame even when paused, so there's something to see
      instance.frame?.(elapsed, 0)
      status.value = 'running'
      if (visible) start()
    } catch (error) {
      status.value = 'error'
      message.value = error instanceof Error ? error.message : String(error)
      console.error(error)
    } finally {
      creating = null
    }
  })()
  await creating
}

const dispose = () => {
  stop()
  instance?.dispose()
  instance = null
  if (stage.value) stage.value.replaceChildren()
  status.value = 'idle'
}

const toggle = () => {
  paused.value = !paused.value
  if (paused.value) stop()
  else if (visible) start()
}

onMounted(() => {
  paused.value = reducedMotion()
  resizeObserver = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect
    instance?.resize?.(width, height)
    if (!raf) instance?.frame?.(elapsed, 0)
  })
  resizeObserver.observe(stage.value!)

  // On screen: animate
  near = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting
    if (visible) {
      if (instance) start()
      else create()
    } else stop()
  })
  // Far away: free the WebGL context
  far = new IntersectionObserver(
    ([entry]) => {
      if (!entry.isIntersecting) dispose()
    },
    { rootMargin: '1500px 0px' }
  )
  near.observe(root.value!)
  far.observe(root.value!)
})

onBeforeUnmount(() => {
  near?.disconnect()
  far?.disconnect()
  resizeObserver?.disconnect()
  dispose()
})
</script>

<template>
  <figure ref="root" class="example">
    <div
      ref="stage"
      class="example__stage"
      :style="{ height: `${height}px` }"
    />
    <p v-if="status === 'unsupported'" class="example__message">
      This example needs WebGL2, which this browser doesn't support.
    </p>
    <p v-else-if="status === 'error'" class="example__message">
      The example couldn't run: {{ message }}
    </p>
    <div class="example__bar">
      <button
        type="button"
        class="example__button"
        :aria-pressed="paused"
        @click="toggle"
      >
        {{ paused ? 'Play' : 'Pause' }}
      </button>
      <a
        v-if="demo"
        class="example__link"
        :href="`https://wethegit.github.io/wtc-gl/demos/${demo}/`"
        >Open the full demo →</a
      >
    </div>
  </figure>
</template>
