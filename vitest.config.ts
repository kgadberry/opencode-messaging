import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    setupFiles: ["test/jsx.ts"],
  },
  // The TUI half is JSX. Tests never mount a real renderer; they call a slot's
  // render callback to reach the component underneath, so the factory just
  // invokes function components and records anything else. Naming a global
  // keeps esbuild from injecting a jsx-runtime import a node test cannot load.
  esbuild: {
    jsx: "transform",
    jsxFactory: "globalThis.__jsx",
    jsxFragment: "globalThis.__fragment",
  },
})
