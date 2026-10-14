import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const localPreview = mode === 'preview-local'
  return {
    plugins: [react(), ...(localPreview ? [{
      name: 'readonly-local-preview',
      transformIndexHtml(html) {
        // Never load advertising pixels in the local design review.
        return html
          .replace(/<!-- Google tag[\s\S]*?<!-- End Meta Pixel Code -->/, '')
          .replace(/<noscript>[\s\S]*?<\/noscript>/, '')
          .replace('</head>', `<script>
            window.__previewPixelEvents = [];
            window.fbq = (...args) => window.__previewPixelEvents.push(args);
            window.gtag = () => {};
          </script></head>`)
      },
    }] : [])],
    ...(localPreview ? {
      define: {
        'import.meta.env.VITE_API_ENV': JSON.stringify('production'),
        'import.meta.env.VITE_API_BASE_URL': JSON.stringify('/__preview/api'),
        'import.meta.env.VITE_FACEBOOK_API_URL': JSON.stringify('/__preview/api'),
      },
      server: {
        host: '127.0.0.1',
        port: 4173,
        strictPort: true,
        proxy: {
          '/__preview/api': {
            target: 'http://127.0.0.1:5189',
            rewrite: path => path.replace(/^\/__preview\/api/, ''),
          },
        },
      },
    } : {}),
  }
})
