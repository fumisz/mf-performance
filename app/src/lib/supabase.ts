import { createClient } from "@supabase/supabase-js"

// Mesmo projeto do app atual (chave anon é pública; segurança via RLS)
const URL = "https://kpxiqtxgjaroijbuwkzm.supabase.co"
const ANON = "sb_publishable_0_tL0Wz_OsX7XxXSByjHhQ_hS0H44Xv"

export const supabase = createClient(URL, ANON)
