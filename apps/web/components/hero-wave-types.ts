export type Point = { x: number; y: number }

export type Curve = {
  start: Point
  controlA: Point
  controlB: Point
  end: Point
}

export type RibbonShape = { edgeA: Curve; edgeB: Curve }
export type ColorStop = readonly [offset: number, color: string]
export type WaveTheme = "light" | "dark"

export const FRAME_INTERVAL = 1000 / 30
export const MAX_DEVICE_PIXEL_RATIO = 1.5
export const MOTION_SPEED = 0.5

// Keep the storefront's violet, rose and amber palette in both themes.
export const WAVE_PALETTES: Record<
  WaveTheme,
  readonly (readonly ColorStop[])[]
> = {
  dark: [
    [
      [0, "#7ab0ffb3"],
      [0.38, "#874af5cc"],
      [0.72, "#fa6ea8cc"],
      [1, "#ff9438b3"],
    ],
    [
      [0, "#ffca66b3"],
      [0.4, "#ff9438d9"],
      [0.8, "#fa6ea8b3"],
      [1, "#874af599"],
    ],
    [
      [0, "#ffb875b3"],
      [0.35, "#fa6ea8cc"],
      [0.75, "#874af5cc"],
      [1, "#7ab0ff99"],
    ],
  ],
  light: [
    [
      [0, "#628edbc2"],
      [0.38, "#7640cfc2"],
      [0.72, "#d94e9aba"],
      [1, "#e88637b3"],
    ],
    [
      [0, "#eeb24da6"],
      [0.4, "#ef8831cc"],
      [0.8, "#d94e9ab3"],
      [1, "#7640cf99"],
    ],
    [
      [0, "#e5a557ad"],
      [0.35, "#d94e9aba"],
      [0.75, "#7640cfb3"],
      [1, "#628edb99"],
    ],
  ],
}
