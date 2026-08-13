import { motion } from "motion/react"
import { cn } from "@/lib/utils"

export type Tab = "home" | "prog" | "avisos" | "conta"

const items: { id: Tab; icon: string; label: string }[] = [
  { id: "home", icon: "🏠", label: "Início" },
  { id: "prog", icon: "📈", label: "Progresso" },
  { id: "avisos", icon: "🔔", label: "Avisos" },
  { id: "conta", icon: "👤", label: "Conta" },
]

export function StudentNav({
  tab,
  onTab,
  unread = 0,
}: {
  tab: Tab
  onTab: (t: Tab) => void
  unread?: number
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-md items-stretch justify-around border-t border-white/10 bg-background/80 px-2 pb-[env(safe-area-inset-bottom)] pt-1.5 backdrop-blur-xl">
      {items.map((it) => {
        const active = tab === it.id
        return (
          <button
            key={it.id}
            onClick={() => onTab(it.id)}
            className="relative flex flex-1 flex-col items-center gap-0.5 py-1.5"
          >
            {active && (
              <motion.span
                layoutId="nav-pill"
                className="absolute inset-x-3 inset-y-0 -z-10 rounded-2xl bg-primary/15"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            <span
              className={cn(
                "text-xl transition-transform",
                active ? "-translate-y-0.5" : "opacity-60 grayscale"
              )}
            >
              {it.icon}
            </span>
            <span
              className={cn(
                "text-[10.5px] font-bold",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              {it.label}
            </span>
            {it.id === "avisos" && unread > 0 && (
              <span className="absolute right-[calc(50%-1.35rem)] top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-extrabold text-white">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}
