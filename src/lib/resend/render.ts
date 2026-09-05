import { render as renderToHtml } from '@react-email/render'
import { createElement, type ComponentType, type ReactElement } from 'react'

/**
 * Renders a React Email template to HTML for sending via Resend.
 *
 * @example
 * ```ts
 * import { renderTemplate } from '@/lib/resend'
 * import { WelcomeEmail } from '@/lib/resend/templates'
 * const html = await renderTemplate(WelcomeEmail, { userName: 'Jane' })
 * await resend.emails.send({ from, to, subject, html })
 * ```
 */
export async function renderTemplate<P extends object>(Component: ComponentType<P>, props: P): Promise<string> {
  const element = createElement(Component, props) as ReactElement
  return renderToHtml(element)
}

export { renderToHtml }
