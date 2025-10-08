import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  root: ".",                     // serve from project root
  publicDir: "public",           // make sure /public is used
  server: {
    open: true,                  // auto open browser
    port: 5173,                  // match your local port
  },
  build: {
    outDir: "dist",
  },
});
