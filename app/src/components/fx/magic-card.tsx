import { useCallback } from "react"
import type { MouseEvent, ReactNode } from "react"
import { motion, useMotionTemplate, useMotionValue } from "motion/react"
import { cn } from "@/lib/utils"

export function MagicCard({
  children,
  className,
  color = "139,92,246",
  size = 240,
}: {
  children?: ReactNode
  className?: string
  color?: string
  size?: number
}) {
  const mx = useMotionValue(-size)
  const my = useMotionValue(-size)

  const onMove = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      const r = e.currentTarget.getBoundingClientRect()
      mx.set(e.clientX - r.left)
      my.set(e.clientY - r.top)
    },
    [mx, my]
  )

  const bg = useMotionTemplate`radial-gradient(${size}px circle at ${mx}px ${my}px, rgba(${color},0.18), transparent 72%)`

  return (
    <div
      onMouseMove={onMove}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-white/10 bg-card",
        className
      )}
    >
      <motion.div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: bg }}
      />
      <div className="relative">{children}</div>
    </div>
  )
}
