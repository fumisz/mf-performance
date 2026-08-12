import { useEffect, useState } from "react"

export function NumberTicker({
  value,
  className,
  decimals = 0,
  duration = 1400,
}: {
  value: number
  className?: string
  decimals?: number
  duration?: number
}) {
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(value * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])

  return (
    <span className={className}>
      {new Intl.NumberFormat("pt-BR", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(display)}
    </span>
  )
}
