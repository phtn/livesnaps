import rspack from '@rspack/core'
import { beastOctane } from 'beast-tsrx/rspack'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const srcDir = fileURLToPath(new URL('./src', import.meta.url))
const root = path.dirname(fileURLToPath(import.meta.url))
const octaneMdxLoader = fileURLToPath(new URL('./octane-mdx-loader.mjs', import.meta.url))
const localApiOrigin = process.env.LIVESNAPS_LOCAL_API_ORIGIN ?? 'http://localhost:8787'

const publicEnvNames = [
  'PUBLIC_FIREBASE_API_KEY',
  'PUBLIC_FIREBASE_AUTH_DOMAIN',
  'PUBLIC_FIREBASE_PROJECT_ID',
  'PUBLIC_FIREBASE_STORAGE_BUCKET',
  'PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'PUBLIC_FIREBASE_APP_ID',
  'PUBLIC_FIREBASE_MEASUREMENT_ID',
  'PUBLIC_CONVEX_URL'
] as const

const readEnvFile = (filename: string) => {
  if (!fs.existsSync(filename)) return {}

  return Object.fromEntries(
    fs
      .readFileSync(filename, 'utf8')
      .split(/\r?\n/)
      .flatMap((line) => {
        const match = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/)
        if (!match) return []
        const value = match[2].replace(/^(['"])(.*)\1$/, '$2')
        return [[match[1], value]]
      })
  ) as Record<string, string>
}

const fileEnv = { ...readEnvFile(path.join(root, '.env')), ...readEnvFile(path.join(root, '.env.local')) }
const publicEnv = Object.fromEntries(
  publicEnvNames.map((name) => [name, process.env[name] ?? fileEnv[name] ?? undefined])
)

export default {
  context: root,
  entry: './src/main.ts',
  output: {
    clean: true,
    publicPath: '/',
    filename: '[name].[contenthash:8].js',
    chunkFilename: '[name].[contenthash:8].js',
    cssFilename: '[name].[contenthash:8].css',
    cssChunkFilename: '[name].[contenthash:8].css'
  },
  optimization: {
    splitChunks: {
      chunks: 'all'
    }
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.btsx', '.mdx'],
    // `@octanejs/day-picker` ships TypeScript sources that import with explicit
    // `.js` extensions (NodeNext style). Without this mapping those specifiers
    // resolve against the non-existent emitted files and the package fails.
    extensionAlias: {
      '.js': ['.ts', '.tsx', '.js']
    },
    alias: {
      '@': srcDir
    }
  },
  module: {
    rules: [
      {
        test: /\.mdx$/,
        type: 'javascript/auto',
        use: [{ loader: octaneMdxLoader }]
      },
      {
        test: /\.css$/,
        type: 'css/auto',
        use: ['postcss-loader']
      },
      {
        test: /\.(woff2?|png|jpe?g|webp|svg|ico)$/i,
        type: 'asset/resource'
      }
    ]
  },
  plugins: [
    new rspack.DefinePlugin(
      Object.fromEntries(publicEnvNames.map((name) => [`import.meta.env.${name}`, JSON.stringify(publicEnv[name])]))
    ),
    beastOctane(),
    new rspack.CopyRspackPlugin({
      patterns: [
        { from: 'public', to: '.' },
        { from: 'favicon.ico', to: 'favicon.ico' }
      ]
    }),
    new rspack.HtmlRspackPlugin({
      template: './index.html',
      chunks: ['main']
    })
  ],
  devServer: {
    port: 3000,
    historyApiFallback: true,
    proxy: [
      {
        context: ['/api'],
        target: localApiOrigin,
        changeOrigin: true
      }
    ]
  }
}
