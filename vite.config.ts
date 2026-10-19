import { defineConfig } from 'vite'; import react from '@vitejs/plugin-react'
// base './' lets the built site work from any path, including https://<user>.github.io/<repo>/
export default defineConfig({ base: './', plugins: [react()] })
