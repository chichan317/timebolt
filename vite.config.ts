import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' makes all asset URLs relative, so the build works on
// GitHub Pages project sites (https://user.github.io/repo/) without
// any extra configuration.
export default defineConfig({
  base: './',
  plugins: [react()],
});
