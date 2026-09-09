import QRCode, { type Options } from 'qrcode-svg'

export type QRCodeOptions = Options

export const qrCreate = (options: Options) => {
  const code = new QRCode({
    ...options,
    padding: options.padding ?? 4,
    ecl: options.ecl ?? 'M',
    content: options.content,
    width: options.width ?? 280,
    height: options.height ?? 280,
    background: options.background ?? '#ffffff',
    color: options.color ?? '#12121a',
    xmlDeclaration: options.xmlDeclaration ?? false
  })

  return code.svg()
}
