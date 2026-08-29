import rspack from '@rspack/core'
import { beastOctane } from 'beast-tsrx/rspack'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const srcDir = fileURLToPath(new URL('./src', import.meta.url))
const root = path.dirname(fileURLToPath(import.meta.url))

export default {
  context: root,
  entry: './src/main.ts',
  output: {
    clean: true
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.btsx'],
    alias: {
      '@': srcDir
    }
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        type: 'css',
        use: ['postcss-loader']
      },
      {
        test: /\.(woff2?|png|jpe?g|webp|svg|ico)$/i,
        type: 'asset/resource'
      }
    ]
  },
  plugins: [
    beastOctane(),
    new rspack.CopyRspackPlugin({
      patterns: [{ from: 'public', to: '.' }]
    }),
    new rspack.HtmlRspackPlugin({
      template: './index.html'
    })
  ],
  devServer: {
    port: 3000,
    historyApiFallback: true
  }
}
