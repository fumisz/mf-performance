// Protocolos de dobras cutâneas — idênticos ao app antigo.
// Siri: %G = 495/DC − 450 (Faulkner já retorna o percentual).

export const SF_LABELS: Record<string, string> = {
  sf_triceps: "tríceps",
  sf_subscapular: "subescapular",
  sf_biceps: "bíceps",
  sf_chest: "tórax",
  sf_midaxillary: "axilar média",
  sf_suprailiac: "suprailíaca",
  sf_abdomen: "abdominal",
  sf_thigh: "coxa",
  sf_calf: "panturrilha",
}

type Protocol = {
  label: string
  short: string
  n: number
  sites: { M: string[]; F: string[] }
}

export const SF_PROTOCOLS: Record<string, Protocol> = {
  jp7: {
    label: "Jackson-Pollock — 7 dobras",
    short: "JP7",
    n: 7,
    sites: {
      M: ["sf_chest", "sf_midaxillary", "sf_triceps", "sf_subscapular", "sf_abdomen", "sf_suprailiac", "sf_thigh"],
      F: ["sf_chest", "sf_midaxillary", "sf_triceps", "sf_subscapular", "sf_abdomen", "sf_suprailiac", "sf_thigh"],
    },
  },
  jp3: {
    label: "Jackson-Pollock — 3 dobras",
    short: "JP3",
    n: 3,
    sites: { M: ["sf_chest", "sf_abdomen", "sf_thigh"], F: ["sf_triceps", "sf_suprailiac", "sf_thigh"] },
  },
  guedes3: {
    label: "Guedes — 3 dobras",
    short: "Guedes",
    n: 3,
    sites: { M: ["sf_triceps", "sf_suprailiac", "sf_abdomen"], F: ["sf_subscapular", "sf_suprailiac", "sf_thigh"] },
  },
  faulkner4: {
    label: "Faulkner — 4 dobras",
    short: "Faulkner",
    n: 4,
    sites: {
      M: ["sf_triceps", "sf_subscapular", "sf_suprailiac", "sf_abdomen"],
      F: ["sf_triceps", "sf_subscapular", "sf_suprailiac", "sf_abdomen"],
    },
  },
}

export function sfSites(protocol: string, gender: string): string[] {
  const P = SF_PROTOCOLS[protocol] || SF_PROTOCOLS.jp7
  return P.sites[gender === "F" ? "F" : "M"]
}

export function sfBodyFat(
  gender: string,
  ageYrs: number,
  vals: Record<string, number | undefined>,
  protocol: string
): number | null {
  const proto = protocol && SF_PROTOCOLS[protocol] ? protocol : "jp7"
  const G = gender === "F" ? "F" : "M"
  const keys = sfSites(proto, G)
  const nums = keys.map((k) => vals[k])
  if (nums.some((v) => v == null || isNaN(v as number))) return null
  const S = (nums as number[]).reduce((x, y) => x + y, 0)
  const a = ageYrs || 0
  let bd: number | null = null
  let fat: number | null = null
  if (proto === "jp7") {
    bd =
      G === "M"
        ? 1.112 - 0.00043499 * S + 0.00000055 * S * S - 0.00028826 * a
        : 1.097 - 0.00046971 * S + 0.00000056 * S * S - 0.00012828 * a
  } else if (proto === "jp3") {
    bd =
      G === "M"
        ? 1.10938 - 0.0008267 * S + 0.0000016 * S * S - 0.0002574 * a
        : 1.0994921 - 0.0009929 * S + 0.0000023 * S * S - 0.0001392 * a
  } else if (proto === "guedes3") {
    bd = G === "M" ? 1.1714 - 0.0671 * Math.log10(S) : 1.1665 - 0.0706 * Math.log10(S)
  } else if (proto === "faulkner4") {
    fat = S * 0.153 + 5.783
  }
  if (fat == null && bd) fat = 495 / bd - 450
  return fat != null && isFinite(fat) ? +fat.toFixed(1) : null
}

export function classifyFat(gender: string, pct: number | null): { l: string; c: string } | null {
  if (pct == null) return null
  if (gender === "M") {
    if (pct < 6) return { l: "Abaixo do ideal", c: "b" }
    if (pct < 14) return { l: "Atlético", c: "g" }
    if (pct < 18) return { l: "Bom", c: "g" }
    if (pct < 25) return { l: "Aceitável", c: "a" }
    return { l: "Acima do ideal", c: "r" }
  }
  if (pct < 14) return { l: "Abaixo do ideal", c: "b" }
  if (pct < 21) return { l: "Atlético", c: "g" }
  if (pct < 25) return { l: "Bom", c: "g" }
  if (pct < 32) return { l: "Aceitável", c: "a" }
  return { l: "Acima do ideal", c: "r" }
}
