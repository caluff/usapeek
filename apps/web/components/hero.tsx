import { ArrowDownRight } from "lucide-react"
import Link from "next/link"

import { HeroWaveBackground } from "@/components/hero-wave-background"
import { Button } from "@/components/ui/button"

export function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="relative isolate overflow-hidden border-b border-border"
    >
      <HeroWaveBackground />
      <div className="relative mx-auto flex min-h-[clamp(38rem,78svh,50rem)] w-full max-w-[90rem] flex-col justify-center px-4 pt-20 pb-28 sm:px-6 sm:pt-24 sm:pb-32 lg:px-10">
        <div className="max-w-4xl">
          <h1
            id="hero-title"
            className="text-[clamp(3rem,5.6vw,5.25rem)] leading-[1.04] font-normal tracking-[-0.06em] text-balance"
          >
            Objetos con historia.
            <br />
            <span className="hero-title-accent">Un lugar para descubrir.</span>
          </h1>
        </div>

        <div className="mt-8 max-w-sm sm:max-w-md">
          <p className="font-sans text-base leading-7 text-foreground/75 sm:text-lg sm:leading-8">
            Piezas singulares reunidas en un catálogo vivo, directo desde su
            origen.
          </p>
          <Button
            asChild
            variant="accent"
            size="lg"
            className="mt-8 w-full sm:w-auto"
          >
            <Link href="/search">
              Explorar catálogo
              <ArrowDownRight aria-hidden="true" className="size-5" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
