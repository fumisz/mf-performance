export function AuroraBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background">
      <div
        className="absolute -left-1/4 -top-1/3 size-[65vh] rounded-full blur-[90px] opacity-45"
        style={{
          background: "radial-gradient(circle, #7c3aed, transparent 65%)",
          animation: "fx-aurora 18s ease-in-out infinite",
        }}
      />
      <div
        className="absolute -right-1/4 top-1/4 size-[60vh] rounded-full blur-[90px] opacity-35"
        style={{
          background: "radial-gradient(circle, #06b6d4, transparent 65%)",
          animation: "fx-aurora 22s ease-in-out infinite reverse",
        }}
      />
      <div
        className="absolute bottom-0 left-1/3 size-[55vh] rounded-full blur-[100px] opacity-30"
        style={{
          background: "radial-gradient(circle, #22c55e, transparent 65%)",
          animation: "fx-aurora 26s ease-in-out infinite",
        }}
      />
      {/* leve textura de grão para tirar o ar 'plástico' */}
      <div className="absolute inset-0 opacity-[0.15] [background-image:radial-gradient(rgba(255,255,255,0.35)_0.5px,transparent_0.5px)] [background-size:22px_22px]" />
    </div>
  )
}
