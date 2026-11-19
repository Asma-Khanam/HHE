import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Older Android WebViews (Chrome before 104, common on emulators and older phones) don't
    // understand the modern "(width<=780px)" media query form. Targeting older browsers makes the
    // build write the classic "(max-width: 780px)" form so the phone layout applies everywhere.
    cssTarget: ['chrome90', 'safari14'],
  },
})
