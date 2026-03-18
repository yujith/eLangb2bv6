import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    hmr: {
      timeout: 10000,
      overlay: true,
    },
    // Watch options to prevent excessive file watching
    watch: {
      ignored: [
        '**/node_modules/**',
        '**/dist/**',
        '**/.git/**',
        '**/supabase/migrations/**',
        '**/supabase/.temp/**',
      ],
    },
  },
  // Increase Node.js memory limit for large projects
  define: {
    // Prevent memory issues in development
    __VITE_MEMORY_LIMIT__: JSON.stringify('4096'),
  },
  // Optimize build for development
  build: {
    // Reduce chunk size to prevent memory issues
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
})
