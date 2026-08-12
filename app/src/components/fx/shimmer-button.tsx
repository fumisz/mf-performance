import type { ButtonHTMLAttributes } from "react"
import { cn } from "@/lib/utils"

export function ShimmerButton({
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "relative inline-flex h-12 w-full items-center justify-center overflow-hidden rounded-xl px-6 font-semibold text-white",
        "bg-gradient-to-r from-violet-600 to-fuchsia-600 shadow-[0_10px_30px_-8px_rgba(139,92,246,0.7)]",
        "transition-transform active:scale-[0.98]",
        "before:absolute before:inset-0 before:-translate-x-full before:animate-[fx-shimmer_2.2s_infinite]",
        "before:bg-gradient-to-r before:from-transparent before:via-white/35 before:to-transparent",
        className
      )}
      {...props}
    >
      <span className="relative z-10 flex items-center gap-2">{children}</span>
    </button>
  )
}
