import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function BentoGrid({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-4", className)}>
      {children}
    </div>
  )
}
