declare module 'qrcode-svg' {
  export interface Options {
    content: string
    padding?: number
    width?: number
    height?: number
    typeNumber?: number
    color?: string
    background?: string
    ecl?: 'L' | 'M' | 'Q' | 'H'
    container?: 'svg' | 'svg-viewbox' | 'g' | 'none'
    join?: boolean
    predefined?: boolean
    pretty?: boolean
    swap?: boolean
    xmlDeclaration?: boolean
  }

  export default class QRCode {
    constructor(options: Options | string)
    svg(): string
    save(file: string, callback?: (error?: unknown, result?: unknown) => void): void
  }
}
