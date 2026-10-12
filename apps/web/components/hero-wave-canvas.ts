import { drawHeroWaveFrame } from "./hero-wave-drawing"
import {
  FRAME_INTERVAL,
  MAX_DEVICE_PIXEL_RATIO,
  MOTION_SPEED,
} from "./hero-wave-types"
import type { WaveTheme } from "./hero-wave-types"

export function createHeroWave(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d", { alpha: true })
  if (!context) return null

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
  let theme: WaveTheme = "light"
  let width = 0
  let height = 0
  let elapsed = 4200
  let frameId = 0
  let lastFrame = 0
  let isPaused = false
  let isVisible = true
  let isContextLost = false

  function draw() {
    if (!context || isContextLost || width === 0 || height === 0) return
    drawHeroWaveFrame(context, width, height, elapsed, theme)
    canvas.dataset.ready = "true"
  }

  function tick(now: number) {
    frameId = 0
    if (now - lastFrame >= FRAME_INTERVAL) {
      elapsed += lastFrame ? Math.min(now - lastFrame, 100) * MOTION_SPEED : 0
      lastFrame = now
      draw()
    }
    frameId = requestAnimationFrame(tick)
  }

  function syncPlayback() {
    cancelAnimationFrame(frameId)
    frameId = 0
    lastFrame = 0
    draw()
    if (
      !isPaused &&
      !reducedMotion.matches &&
      isVisible &&
      !document.hidden &&
      !isContextLost
    ) {
      frameId = requestAnimationFrame(tick)
    }
  }

  function resize() {
    if (!context) return
    const bounds = canvas.getBoundingClientRect()
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO)
    width = Math.max(1, bounds.width)
    height = Math.max(1, bounds.height)
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    draw()
  }

  function onContextLost(event: Event) {
    event.preventDefault()
    isContextLost = true
    canvas.dataset.ready = "false"
    syncPlayback()
  }

  function onContextRestored() {
    isContextLost = false
    resize()
    syncPlayback()
  }

  const resizeObserver = new ResizeObserver(resize)
  const intersectionObserver = new IntersectionObserver(
    ([entry]) => {
      isVisible = entry?.isIntersecting ?? false
      syncPlayback()
    },
    { threshold: 0.01 },
  )
  resizeObserver.observe(canvas)
  intersectionObserver.observe(canvas)
  reducedMotion.addEventListener("change", syncPlayback)
  document.addEventListener("visibilitychange", syncPlayback)
  canvas.addEventListener("contextlost", onContextLost)
  canvas.addEventListener("contextrestored", onContextRestored)
  resize()
  syncPlayback()

  return {
    setPaused(value: boolean) {
      isPaused = value
      syncPlayback()
    },
    setTheme(value: WaveTheme) {
      theme = value
      draw()
    },
    dispose() {
      cancelAnimationFrame(frameId)
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      reducedMotion.removeEventListener("change", syncPlayback)
      document.removeEventListener("visibilitychange", syncPlayback)
      canvas.removeEventListener("contextlost", onContextLost)
      canvas.removeEventListener("contextrestored", onContextRestored)
      canvas.dataset.ready = "false"
    },
  }
}
