import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function GradientText({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        "bg-gradient-to-r from-violet-400 via-fuchsia-400 to-emerald-400 bg-clip-text text-transparent [background-size:200%_auto] animate-[fx-gradient_4s_linear_infinite]",
        className
      )}
    >
      {children}
    </span>
  )
}
