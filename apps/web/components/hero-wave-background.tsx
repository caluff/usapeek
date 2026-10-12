"use client"

import { Pause, Play } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useRef, useState } from "react"

import { createHeroWave } from "@/components/hero-wave-canvas"
import { Button } from "@/components/ui/button"

export function HeroWaveBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<ReturnType<typeof createHeroWave>>(null)
  const { resolvedTheme } = useTheme()
  const [isPaused, setIsPaused] = useState(false)

  useEffect(() => {
    if (!canvasRef.current) return
    const animation = createHeroWave(canvasRef.current)
    animationRef.current = animation

    return () => {
      animation?.dispose()
      animationRef.current = null
    }
  }, [])

  useEffect(() => {
    animationRef.current?.setTheme(resolvedTheme === "dark" ? "dark" : "light")
  }, [resolvedTheme])

  function toggleAnimation() {
    const nextIsPaused = !isPaused
    animationRef.current?.setPaused(nextIsPaused)
    setIsPaused(nextIsPaused)
  }

  return (
    <>
      <div className="hero-gradient" aria-hidden="true">
        <canvas ref={canvasRef} className="hero-gradient-canvas" />
      </div>
      <div className="hero-motion-control pointer-events-none absolute inset-x-0 bottom-5 z-10 mx-auto flex max-w-[90rem] justify-end px-4 sm:px-6 lg:px-10">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="pointer-events-auto rounded-full border border-foreground/10 bg-background/40 text-foreground/70 backdrop-blur-md hover:bg-background/65 motion-reduce:hidden"
          aria-label={isPaused ? "Reanudar animación" : "Pausar animación"}
          title={isPaused ? "Reanudar animación" : "Pausar animación"}
          onClick={toggleAnimation}
        >
          {isPaused ? (
            <Play className="size-3.5" aria-hidden="true" />
          ) : (
            <Pause className="size-3.5" aria-hidden="true" />
          )}
        </Button>
      </div>
    </>
  )
}
