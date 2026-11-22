import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relativa sökvägar: fungerar både på jackepp.github.io/money-dash/ och lokalt
  base: './',
  server: { port: 5173 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
