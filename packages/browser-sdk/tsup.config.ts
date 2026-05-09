import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts', 'src/react.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    splitting: true,
    clean: true,
    external: ['react'],
    minify: true,
  },
  {
    entry: { 'flash-queue': 'src/umd.ts' },
    format: ['iife'],
    globalName: 'FlashEngine',
    dts: false,
    splitting: false,
    minify: true,
  },
]);
