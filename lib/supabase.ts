// lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Skapa och exportera en enda, enkel klient för webbläsaren.
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
