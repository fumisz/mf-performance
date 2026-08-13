import { motion } from "motion/react"

export function BorderBeam({
  size = 220,
  duration = 7,
  delay = 0,
  colorFrom = "#a855f7",
  colorTo = "#22d3ee",
}: {
  size?: number
  duration?: number
  delay?: number
  colorFrom?: string
  colorTo?: string
}) {
  return (
    <div className="pointer-events-none absolute inset-0 rounded-[inherit] [border:1.5px_solid_transparent] [mask-clip:padding-box,border-box] [mask-composite:intersect] [mask:linear-gradient(transparent,transparent),linear-gradient(#000,#000)]">
      <motion.div
        className="absolute aspect-square"
        style={{
          width: size,
          offsetPath: `rect(0 auto auto 0 round ${size}px)`,
          background: `linear-gradient(to left, ${colorFrom}, ${colorTo}, transparent)`,
        }}
        animate={{ offsetDistance: ["0%", "100%"] }}
        transition={{ duration, repeat: Infinity, ease: "linear", delay: -delay }}
      />
    </div>
  )
}
