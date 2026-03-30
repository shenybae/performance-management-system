import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(async ({mode}) => {
  const env = loadEnv(mode, '.', '');

  const plugins: any[] = [react()];

  // Allow skipping the @tailwindcss/vite plugin in build environments
  // where its optional native bindings cause failures. Set
  // SKIP_TAILWIND_VITE_PLUGIN=true in the Dockerfile or CI to skip it.
  if (process.env.SKIP_TAILWIND_VITE_PLUGIN !== 'true') {
    // Dynamically import so node doesn't evaluate native-binding modules
    // during module initialization when the plugin is skipped.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const tailwindcss = (await import('@tailwindcss/vite')).default;
      plugins.push(tailwindcss());
    } catch (e) {
      // If dynamic import fails, continue without the plugin — Tailwind
      // still runs via the PostCSS setup imported in CSS files.
      // Log to console so CI logs show the reason.
      // eslint-disable-next-line no-console
      console.warn('Could not load @tailwindcss/vite plugin:', e && (e as Error).message);
    }
  }

  return {
    plugins,
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
