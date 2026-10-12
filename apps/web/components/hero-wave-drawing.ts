import { createHeroRibbons } from "./hero-wave-shapes"
import { WAVE_PALETTES } from "./hero-wave-types"
import type { Curve, Point, RibbonShape, WaveTheme } from "./hero-wave-types"

function between(a: Point, b: Point, fraction: number): Point {
  return {
    x: a.x * (1 - fraction) + b.x * fraction,
    y: a.y * (1 - fraction) + b.y * fraction,
  }
}

function surfaceCurve({ edgeA, edgeB }: RibbonShape, fraction: number): Curve {
  return {
    start: between(edgeA.start, edgeB.start, fraction),
    controlA: between(edgeA.controlA, edgeB.controlA, fraction),
    controlB: between(edgeA.controlB, edgeB.controlB, fraction),
    end: between(edgeA.end, edgeB.end, fraction),
  }
}

function appendCurve(path: Path2D, curve: Curve, reverse = false) {
  const first = reverse ? curve.controlB : curve.controlA
  const second = reverse ? curve.controlA : curve.controlB
  const end = reverse ? curve.start : curve.end
  path.bezierCurveTo(first.x, first.y, second.x, second.y, end.x, end.y)
}

function sheetPath(shape: RibbonShape): Path2D {
  const path = new Path2D()
  path.moveTo(shape.edgeA.start.x, shape.edgeA.start.y)
  appendCurve(path, shape.edgeA)
  path.lineTo(shape.edgeB.end.x, shape.edgeB.end.y)
  appendCurve(path, shape.edgeB, true)
  path.closePath()
  return path
}

export function drawHeroWaveFrame(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  theme: WaveTheme,
) {
  context.clearRect(0, 0, width, height)
  const ribbons = createHeroRibbons(width, height, time)
  const fiberCount = Math.min(144, Math.max(60, Math.round(width / 10)))

  ribbons.forEach((shape, layer) => {
    context.save()
    const tint = context.createLinearGradient(
      width * 0.35,
      -height * 0.1,
      width * 0.96,
      height,
    )
    for (const [position, color] of WAVE_PALETTES[theme][layer]) {
      tint.addColorStop(position, color)
    }
    context.fillStyle = tint
    context.globalAlpha = layer === 2 ? 0.75 : 0.65
    context.globalCompositeOperation = theme === "dark" ? "screen" : "multiply"
    context.fill(sheetPath(shape))

    context.globalCompositeOperation = "source-over"
    context.strokeStyle = theme === "dark" ? "#fff4ed" : "#7b5397"
    for (let fiber = 0; fiber <= fiberCount; fiber += 1) {
      const position = fiber / fiberCount
      const curve = surfaceCurve(shape, position)
      const path = new Path2D()
      path.moveTo(curve.start.x, curve.start.y)
      appendCurve(path, curve)
      const edge = fiber === 0 || fiber === fiberCount
      const highlight = fiber % 36 === 0
      context.lineWidth = edge ? 1 : highlight ? 0.85 : 0.45
      context.globalAlpha = edge
        ? 0.17
        : highlight
          ? 0.14
          : 0.025 + 0.015 * Math.sin(position * 18 + time * 0.0003)
      context.stroke(path)
    }
    context.restore()
  })
}
