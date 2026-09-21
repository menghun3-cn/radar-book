import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/radar-book/",
  plugins: [react()],
  build: {
    assetsInlineLimit: 0,
  },
});
