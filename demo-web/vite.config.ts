import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const tileUrl =
    env.VITE_TILE_URL?.trim() ||
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  const origin = new URL(tileUrl).origin;
  if (!origin.startsWith("https://"))
    throw new Error("Tile providers must use HTTPS");
  return {
    plugins: [
      react(),
      {
        name: "tile-provider-csp",
        generateBundle() {
          this.emitFile({
            type: "asset",
            fileName: "tile-provider.json",
            source: JSON.stringify({ origin }),
          });
        },
      },
    ],
    server: {
      proxy: {
        "/api": "http://127.0.0.1:3000",
        "/socket.io": { target: "http://127.0.0.1:3000", ws: true },
      },
    },
  };
});
