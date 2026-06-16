import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";

const supabaseUrl =
  (Constants.expoConfig?.extra?.supabaseUrl as string | undefined) ??
  process.env["EXPO_PUBLIC_SUPABASE_URL"] ??
  "";
const supabaseAnonKey =
  (Constants.expoConfig?.extra?.supabaseAnonKey as string | undefined) ??
  process.env["EXPO_PUBLIC_SUPABASE_ANON_KEY"] ??
  "";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
