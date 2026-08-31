import { compileMdx } from '@octanejs/mdx/compile'

export default function octaneMdxLoader(source, inputSourceMap) {
  const done = this.async()

  void compileMdx(String(source), this.resourcePath, {
    mode: 'client',
    hmr: this.hot === true,
    dev: this.mode !== 'production'
  }).then(({ code, diagnostics, map }) => {
    for (const diagnostic of diagnostics) {
      this.emitWarning(new Error(`${diagnostic.filename}:${diagnostic.start.line}:${diagnostic.start.column} ${diagnostic.message}`))
    }
    done(null, code, map ?? inputSourceMap)
  }).catch((error) => done(error))
}
