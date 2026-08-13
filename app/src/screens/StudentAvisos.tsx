import { MagicCard } from "@/components/fx/magic-card"

type Aviso = {
  id: string
  tipo: "parabens" | "lembrete" | "aviso"
  titulo: string
  texto: string
  quando: string
  lido: boolean
}

const ICON: Record<Aviso["tipo"], string> = {
  parabens: "🏆",
  lembrete: "⏰",
  aviso: "📣",
}

const avisos: Aviso[] = [
  {
    id: "1",
    tipo: "parabens",
    titulo: "Parabéns pelo novo recorde! 🏆",
    texto: "Você bateu 52,5 kg no agachamento. Segue firme!",
    quando: "há 1h",
    lido: false,
  },
  {
    id: "2",
    tipo: "lembrete",
    titulo: "Treino de hoje te espera",
    texto: "Bora fechar mais um? Não esqueça de registrar as cargas.",
    quando: "há 1 dia",
    lido: false,
  },
  {
    id: "3",
    tipo: "aviso",
    titulo: "Sua reavaliação está chegando",
    texto: "Semana que vem faremos sua reavaliação. Capricha no sono!",
    quando: "há 3 dias",
    lido: true,
  },
]

export function StudentAvisos() {
  return (
    <div className="mx-auto min-h-screen max-w-md px-4 pb-24 pt-6">
      <h1 className="mb-4 text-2xl font-extrabold tracking-tight">Avisos</h1>
      <div className="flex flex-col gap-3">
        {avisos.map((a) => (
          <MagicCard
            key={a.id}
            className={a.lido ? "" : "border-primary/40"}
          >
            <div className="flex gap-3 p-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-lg">
                {ICON[a.tipo]}
              </div>
              <div className="min-w-0 flex-1">
                <p className="pr-4 font-bold leading-snug">{a.titulo}</p>
                <p className="mt-1 text-sm leading-snug text-muted-foreground">{a.texto}</p>
                <p className="mt-1.5 text-[11px] text-muted-foreground/70">{a.quando}</p>
              </div>
              {!a.lido && <span className="mt-1 size-2.5 shrink-0 rounded-full bg-primary" />}
            </div>
          </MagicCard>
        ))}
      </div>
    </div>
  )
}
