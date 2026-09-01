import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Runs on a different port than the client app (frontend/ defaults to
// 5173) so both can be running at once during development without a
// conflict.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
  },
})
