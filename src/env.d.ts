interface ImportMetaEnv {
  readonly PUBLIC_FIREBASE_API_KEY?: string
  readonly PUBLIC_FIREBASE_AUTH_DOMAIN?: string
  readonly PUBLIC_FIREBASE_PROJECT_ID?: string
  readonly PUBLIC_FIREBASE_STORAGE_BUCKET?: string
  readonly PUBLIC_FIREBASE_MESSAGING_SENDER_ID?: string
  readonly PUBLIC_FIREBASE_APP_ID?: string
  readonly PUBLIC_FIREBASE_MEASUREMENT_ID?: string
  readonly PUBLIC_CONVEX_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.btsx' {
  import type { ComponentBody } from 'octane'

  const component: ComponentBody
  export default component
}
