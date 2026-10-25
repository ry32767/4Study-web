import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const url = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (Boolean(url) !== Boolean(key))
    throw new Error(
      "Set both Supabase URL and Publishable key, or neither for demo mode.",
    );
  if (
    url &&
    (new URL(url).protocol !== "https:" || !key.startsWith("sb_publishable_"))
  ) {
    throw new Error(
      "Use an HTTPS Supabase URL and sb_publishable_ key. Secret/legacy service keys must not be bundled.",
    );
  }
  return {};
});
