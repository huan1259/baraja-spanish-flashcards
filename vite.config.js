import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base is "/" for Vercel/Netlify. For GitHub Pages at
// https://USERNAME.github.io/baraja/ change it to "/baraja/".
export default defineConfig({
  base: "/",
  plugins: [react()],
});
