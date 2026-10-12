import type { Curve, RibbonShape } from "./hero-wave-types"

type EdgeWidths = readonly [number, number, number, number]

function offsetEdge(curve: Curve, widths: EdgeWidths, side: number): Curve {
  return {
    start: { ...curve.start, x: curve.start.x + widths[0] * side },
    controlA: { ...curve.controlA, x: curve.controlA.x + widths[1] * side },
    controlB: { ...curve.controlB, x: curve.controlB.x + widths[2] * side },
    end: { ...curve.end, x: curve.end.x + widths[3] * side },
  }
}

export function createHeroRibbons(
  width: number,
  height: number,
  time: number,
): RibbonShape[] {
  const compact = width < 720
  const breadth = width * (compact ? 0.62 : 1)
  const sway = Math.sin(time * 0.00015) * 0.055
  const bend = Math.cos(time * 0.00011) * 0.035
  const turn = Math.sin(time * 0.00013 - 1.5)

  return [0, 1, 2].map((layer) => {
    const offset = (layer - 1) * 0.035
    const centerline: Curve = {
      start: {
        x: width * ((compact ? 0.74 : 0.51) + offset + sway),
        y: -height * 0.18,
      },
      controlA: {
        x: width * ((compact ? 0.81 : 0.55) + offset - bend),
        y: height * 0.24,
      },
      controlB: { x: width * (0.78 + offset + bend), y: height * 0.68 },
      end: { x: width * (0.92 + offset - sway * 0.4), y: height * 1.16 },
    }

    // Only the foreground sheet turns over. A signed width exchanges its
    // upper edges while the lower edges stay open, carrying every fiber
    // through the same continuous Bézier fold.
    const spans: EdgeWidths =
      layer === 2
        ? [0.18 * turn, 0.15 * turn, 0.1, 0.14]
        : layer === 1
          ? [0.12, 0.13, 0.075, 0.1]
          : [0.25, 0.24, 0.15, 0.2]
    const edgeWidths: EdgeWidths = [
      spans[0] * breadth,
      spans[1] * breadth,
      spans[2] * breadth,
      spans[3] * breadth,
    ]

    return {
      edgeA: offsetEdge(centerline, edgeWidths, -1),
      edgeB: offsetEdge(centerline, edgeWidths, 1),
    }
  })
}
