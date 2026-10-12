import { networkInterfaces } from "node:os";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

/** This machine's local network IPv4 address, for the TV's join QR code in dev. */
const lanHost = () =>
  Object.values(networkInterfaces())
    .flat()
    .find((a) => a?.family === "IPv4" && !a.internal)?.address;

export default defineConfig(({ command }) => ({
  // NEXT_PUBLIC_ is the prefix Vercel's Clerk integration uses for the publishable key.
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  define: command === "serve" ? { "import.meta.env.VITE_LAN_HOST": JSON.stringify(lanHost()) } : {},
  resolve: { tsconfigPaths: true },
  plugins: [nitro(), tailwindcss(), tanstackStart(), viteReact()],
}));
