import { execSync } from 'node:child_process';
import { defineConfig } from 'vitest/config';

// Version = commit-id. GitHub Actions sätter GITHUB_SHA, lokalt frågar vi git.
function commitSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD').toString().trim();
  } catch {
    return 'okänd';
  }
}
const version = commitSha();
const built = new Date().toISOString();

export default defineConfig({
  // Relativa sökvägar: fungerar både på jackepp.github.io/Economia/ och lokalt
  base: './',
  // _localtest: tillfälliga testfiler (kontoutdrag) – bevakas inte och ligger i .gitignore
  server: { port: 5173, watch: { ignored: ['**/_localtest/**'] } },
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __BUILD_TIME__: JSON.stringify(built),
  },
  plugins: [
    {
      // dist/version.json – appen jämför med sin egen version för att se om en ny är ute
      name: 'version-json',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version, built }) });
      },
    },
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
