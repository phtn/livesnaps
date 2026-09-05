import type { DefaultEmailProps } from '..'

export type TemplateProps = Omit<DefaultEmailProps, 'recipientName'> & {
  recipientName?: string
}

export const DEFAULT_PROPS: TemplateProps = {
  inviterName: 'We',
  title: 'You are invited.',
  message: 'Welcome to LiveSnapsNow!',
  ctaLabel: 'Sign In',
  ctaUrl: 'https://livesnapsnow.com'
}

export function parseTemplateProps(json: string | undefined): TemplateProps {
  if (!json?.trim()) {
    return { ...DEFAULT_PROPS }
  }

  try {
    const parsed = JSON.parse(json) as Partial<TemplateProps>
    return {
      ...DEFAULT_PROPS,
      ...parsed
    }
  } catch {
    return { ...DEFAULT_PROPS }
  }
}

export function getInvitationDefaultProps(): TemplateProps {
  return { ...DEFAULT_PROPS }
}
