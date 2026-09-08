import { compile } from 'octane/compiler'
import { compileBeast } from 'beast-tsrx'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [{
    name: 'octane-query-regression',
    enforce: 'pre',
    transform(source, id) {
      const filename = id.split('?')[0]
      if (filename.endsWith('.tsrx')) return compile(source, filename, { dev: process.env.OCTANE_TEST_PRODUCTION !== '1' }).code
      if (/\/src\/hooks\/use-(convex-query|convex-auth|capture-settings|admin-pages|workspace)\.ts$/.test(filename)) return compile(source, filename, { dev: process.env.OCTANE_TEST_PRODUCTION !== '1' }).code
      if (filename.endsWith('.btsx')) {
        return compile(compileBeast(source, { filename }), filename.replace(/\.btsx$/, '.tsrx'), { dev: process.env.OCTANE_TEST_PRODUCTION !== '1' }).code
      }
    }
  }],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  test: {
    include: ['tests/**/*.vitest.ts', 'convex/**/*.vitest.ts'],
    environment: 'edge-runtime',
    server: { deps: { inline: ['convex-test'] } }
  }
})
