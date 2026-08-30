/**
 * Gráfico de barras simples (evolução de carga, de peso…).
 * As barras usam altura em % — por isso a coluna precisa de altura definida
 * (h-full dentro de um container com altura fixa); sem isso elas somem.
 */
export function BarChart({
  pontos,
  className = "",
}: {
  pontos: { valor: number; rotulo?: string }[]
  className?: string
}) {
  if (pontos.length === 0) return null
  const vals = pontos.map((p) => p.valor)
  const max = Math.max(...vals)
  const min = Math.min(...vals)
  const temRotulo = pontos.some((p) => p.rotulo)

  return (
    <div className={className}>
      <div className="flex h-28 items-end gap-1.5">
        {pontos.map((p, i) => {
          const h = max === min ? 70 : 18 + ((p.valor - min) / (max - min)) * 64
          return (
            <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[9px] font-bold text-muted-foreground">{p.valor}</span>
              <div
                className="w-full rounded-t bg-gradient-to-t from-violet-600 to-fuchsia-400"
                style={{ height: `${h}%` }}
              />
            </div>
          )
        })}
      </div>
      {temRotulo && (
        <div className="mt-1 flex gap-1.5">
          {pontos.map((p, i) => (
            <span key={i} className="flex-1 text-center text-[9px] text-muted-foreground/70">
              {p.rotulo}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
