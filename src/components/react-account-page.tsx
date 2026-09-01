'use client'

import { UserMenu } from '@/components/app/user-menu'
import { useTheme } from '@/components/theme-provider'
import { ThemeToggle } from '@/components/theme-toggle'
import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { useFileUpload } from '@/hooks/use-file-upload'
import { useStorageUpload } from '@/hooks/use-r2'
import { useToggle } from '@/hooks/use-toggle'
import { signInWithGoogle, signOutUser, useFirebaseUser } from '@/lib/firebase/auth'
import {
  canReceiveFirebaseClaimGrant,
  isFirebaseCustomClaimName,
  isFirebaseCustomClaimValue,
  isPrivilegedFirebaseCustomClaimName,
  type FirebaseCustomClaims
} from '@/lib/firebase/custom-claims'
import { clearFirebaseSession, createFirebaseSession } from '@/lib/firebase/session'
import { formatDateTime } from '@/lib/helpers/formatters'
import { getInitials } from '@/lib/helpers/user'
import { Icon, IconName } from '@/lib/icons'
import { applyMotionPreference, useMotionPreference } from '@/lib/motion-preference'
import { cn, resolveAccountProfileImageUrl } from '@/lib/utils'
import { updateProfile, type User } from 'firebase/auth'
import { UserRoundIcon } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode, type SubmitEvent } from 'react'

const PROFILE_IMAGE_ACCEPT = 'image/avif,image/jpeg,image/png,image/webp'
const PROFILE_IMAGE_MAX_BYTES = 10 * 1024 * 1024
const PROFILE_IMAGE_MAX_DIMENSION = 512
const PROFILE_IMAGE_QUALITY = 0.82

type ImageOptimizerResponse =
  | {
      id: string
      blob: Blob
      size: number
      format: string
    }
  | {
      id: string
      error: string
    }

const optimizeProfileImage = (file: File) =>
  new Promise<File>((resolve, reject) => {
    const worker = new Worker(new URL('../../../public/workers/image-optimizer.worker.ts', import.meta.url), {
      type: 'module'
    })
    const id = crypto.randomUUID()
    const timeoutId = window.setTimeout(() => {
      worker.terminate()
      reject(new Error('Image optimization timed out. Please try a smaller image.'))
    }, 30_000)

    const finish = () => {
      window.clearTimeout(timeoutId)
      worker.terminate()
    }

    worker.addEventListener(
      'message',
      (event: MessageEvent<ImageOptimizerResponse>) => {
        if (event.data.id !== id) return

        finish()

        if ('error' in event.data) {
          reject(new Error(event.data.error))
          return
        }

        const basename = file.name.replace(/\.[^/.]+$/, '') || 'profile-photo'
        resolve(
          new File([event.data.blob], `${basename}.webp`, {
            type: event.data.format,
            lastModified: file.lastModified
          })
        )
      },
      { once: true }
    )

    worker.addEventListener(
      'error',
      () => {
        finish()
        reject(new Error('Unable to optimize the selected image.'))
      },
      { once: true }
    )

    worker.postMessage({
      id,
      file,
      format: 'webp',
      maxDimension: PROFILE_IMAGE_MAX_DIMENSION,
      quality: PROFILE_IMAGE_QUALITY
    })
  })

const accountDateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  year: 'numeric'
})

interface NavigationItem {
  href: string
  label: string
  icon: IconName
}

const navigationItems: NavigationItem[] = [
  { href: '#profile', label: 'Profile', icon: 'cf-pen' },
  { href: '#appearance', label: 'Appearance', icon: 'theme' },
  { href: '#security', label: 'Security', icon: 'safe-shield' },
  { href: '#data', label: 'Data', icon: 'down-to-line' }
]

const formatDate = (value?: string | null) => {
  if (!value) return 'Not available'

  return accountDateFormatter.format(new Date(value))
}

const getProviderLabel = (user: User) => {
  const providerId = user.providerData[0]?.providerId

  if (providerId === 'google.com') return 'Google'
  if (providerId === 'password') return 'Email and password'
  return providerId?.replace('.com', '') ?? 'Firebase'
}

type AddCustomClaimResponse = {
  customClaims?: FirebaseCustomClaims
  error?: unknown
}

type AdminClaimResponse = {
  admin?: boolean
  changed?: boolean
  error?: unknown
  targetEmail?: string | null
  targetUid?: string
}

export const Content = () => {
  const { customClaims, isLoading, user } = useFirebaseUser()

  if (isLoading) {
    return <AccountLoading />
  }

  if (!user) {
    return <SignedOutAccount />
  }

  return <AuthenticatedAccount key={user.uid} customClaims={customClaims} user={user} />
}

const AccountShell = ({ children }: { children: ReactNode }) => (
  <main className='relative min-h-screen overflow-x-hidden bg-background text-foreground'>
    <div className='pointer-events-none fixed inset-0 overflow-hidden' aria-hidden='true'>
      <div className='absolute -right-40 -top-48 size-128 rounded-full bg-mist-300/10 blur-3xl dark:bg-mist-300/5' />
      <div className='absolute -bottom-64 -left-48 size-152 rounded-full bg-mist-300/10 blur-3xl dark:bg-mist-300/5' />
      <div className='absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-size-[72px_72px] opacity-[0.035]' />
    </div>

    <header className='sticky top-0 z-40 bg-background/80 backdrop-blur-xl'>
      <div className='mx-auto flex h-16 items-center justify-between px-4 sm:px-6'>
        <div className='flex items-center gap-3'>
          <Button nativeButton={false} render={<Link href='/' />} aria-label='Back home' size='icon-sm' variant='ghost'>
            <Icon name='chevron-right' className='rotate-90' />
          </Button>
          <div>
            <p className='font-mono text-[10px] uppercase tracking-widest text-muted-foreground px-2'>Workspace</p>
            <p className='text-sm md:text-base font-medium'>Account Settings</p>
          </div>
        </div>
        <div className='flex items-end justify-between space-x-6 w-28'>
          <ThemeToggle />
          <div className='h-8'>
            <UserMenu />
          </div>
        </div>
      </div>
    </header>

    {children}
  </main>
)

const AccountLoading = () => (
  <AccountShell>
    <div className='mx-auto grid gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[13rem_minmax(0,1fr)]'>
      <div className='hidden h-52 animate-pulse rounded-2xl bg-muted/50 lg:block' />
      <div className='space-y-5'>
        <div className='h-48 animate-pulse rounded-3xl bg-muted/60' />
        <div className='h-80 animate-pulse rounded-2xl bg-muted/40' />
      </div>
    </div>
  </AccountShell>
)

const SignedOutAccount = () => {
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const signIn = async () => {
    setError(null)
    setIsSigningIn(true)

    try {
      await signInWithGoogle()
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : 'Unable to sign in.')
    } finally {
      setIsSigningIn(false)
    }
  }

  return (
    <AccountShell>
      <div className='relative mx-auto flex min-h-[calc(100vh-4rem)] items-center px-4 py-10 sm:px-6'>
        <Card className='w-full rounded-3xl bg-card/80 py-8 text-center shadow-2xl shadow-foreground/5 backdrop-blur'>
          <CardHeader className='items-center px-6'>
            <div className='mb-3 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground'>
              <UserRoundIcon className='size-6' />
            </div>
            <CardTitle className='font-poly text-2xl'>Your account, your workspace</CardTitle>
            <CardDescription className='max-w-sm text-balance'>
              Sign in to manage your profile, appearance, accessibility preferences, and account data.
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-3 px-6'>
            <Button className='w-full rounded-xl' disabled={isSigningIn} size='lg' onClick={() => void signIn()}>
              {isSigningIn ? 'Opening Google…' : 'Continue with Google'}
            </Button>
            {error ? <p className='text-sm text-destructive'>{error}</p> : null}
          </CardContent>
        </Card>
      </div>
    </AccountShell>
  )
}

const AuthenticatedAccount = ({ customClaims, user }: { customClaims: FirebaseCustomClaims; user: User }) => {
  const { theme, setTheme } = useTheme()
  const motionPreference = useMotionPreference()
  const router = useRouter()
  const [displayName, setDisplayName] = useState(user.displayName ?? '')
  const [photoUrl, setPhotoUrl] = useState(user.photoURL ?? '')
  const [profileStatus, setProfileStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [profileError, setProfileError] = useState<string | null>(null)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)
  const { on: editName, toggle: toggleEditName } = useToggle()
  const processedProfileImageId = useRef<string | null>(null)
  const { isUploading, uploadFile } = useStorageUpload({
    optimizeImages: false,
    r2KeyPrefix: 'account/pfp'
  })
  const [profileImageUpload, profileImageUploadActions] = useFileUpload({
    accept: PROFILE_IMAGE_ACCEPT,
    maxFiles: 1,
    maxSize: PROFILE_IMAGE_MAX_BYTES
  })
  const { getInputProps, openFileDialog, removeFile: removeProfileImage } = profileImageUploadActions
  const selectedProfileImage = profileImageUpload.files[0]
  const displayedPhotoUrl = selectedProfileImage?.preview ?? resolveAccountProfileImageUrl(photoUrl)
  const profileImageError = profileImageUpload.errors[0] ?? null
  const customClaimEntries = Object.entries(customClaims)

  useEffect(() => {
    if (
      !selectedProfileImage ||
      !(selectedProfileImage.file instanceof File) ||
      processedProfileImageId.current === selectedProfileImage.id
    ) {
      return
    }

    const uploadId = selectedProfileImage.id
    const file = selectedProfileImage.file
    processedProfileImageId.current = uploadId
    let isCancelled = false

    const uploadProfileImage = async () => {
      setProfileError(null)
      setProfileStatus('saving')

      try {
        const sessionPromise = user.getIdToken(true).then(createFirebaseSession)
        const optimizedFilePromise = optimizeProfileImage(file)
        const [, optimizedFile] = await Promise.all([sessionPromise, optimizedFilePromise])
        const { url } = await uploadFile(optimizedFile)

        if (!url) {
          throw new Error('The profile image was uploaded, but no public URL was returned.')
        }

        await updateProfile(user, { photoURL: url })
        await user.reload()

        if (!isCancelled) {
          setPhotoUrl(url)
          setProfileStatus('saved')
          removeProfileImage(uploadId)
        }
      } catch (error) {
        if (!isCancelled) {
          setProfileError(error instanceof Error ? error.message : 'Unable to upload your profile image.')
          setProfileStatus('error')
          removeProfileImage(uploadId)
        }
      }
    }

    void uploadProfileImage()

    return () => {
      isCancelled = true
    }
  }, [removeProfileImage, selectedProfileImage, uploadFile, user])

  const saveProfile = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (profileStatus === 'saving') return

    setProfileError(null)
    setProfileStatus('saving')

    try {
      await updateProfile(user, {
        displayName: displayName.trim() || null,
        photoURL: photoUrl.trim() || null
      })
      toggleEditName()
      await user.reload()
      setProfileStatus('saved')
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Unable to update your profile.')
      setProfileStatus('error')
    }
  }

  const exportAccountData = () => {
    const accountData = {
      exportedAt: new Date().toISOString(),
      profile: {
        uid: user.uid,
        displayName: displayName.trim() || null,
        email: user.email,
        emailVerified: user.emailVerified,
        photoURL: photoUrl.trim() || null,
        providers: user.providerData.map(({ displayName: providerName, email, phoneNumber, photoURL, providerId }) => ({
          displayName: providerName,
          email,
          phoneNumber,
          photoURL,
          providerId
        })),
        createdAt: user.metadata.creationTime,
        lastSignInAt: user.metadata.lastSignInTime
      },
      preferences: { motion: motionPreference, theme }
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(accountData, null, 2)], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'account-data.json'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  const signOut = async () => {
    setSignOutError(null)
    setIsSigningOut(true)

    try {
      await clearFirebaseSession()
      await signOutUser()
      router.replace('/')
    } catch (error) {
      setSignOutError(error instanceof Error ? error.message : 'Unable to sign out right now.')
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <AccountShell>
      <div className='relative mx-auto px-4 py-2 sm:px-6 sm:py-2'>
        <section className='relative mb-2 overflow-hidden py-4 px-2 sm:p-8'>
          <div className='absolute inset-x-0 top-0 h-px bg-transparent' />
          <div className='w-full flex items-start justify-between'>
            <div className='flex min-w-0 items-center gap-4 sm:gap-5'>
              <Avatar className='size-16 ring-0 ring-background sm:size-20 border-0'>
                {displayedPhotoUrl ? (
                  <AvatarImage alt={displayName || 'Profile image'} src={displayedPhotoUrl} className='ring-0' />
                ) : null}
                <AvatarFallback className='font-poly text-lg'>{getInitials(displayName)}</AvatarFallback>
                <AvatarBadge className='bg-foreground size-5! translate-0.5 md:-translate-0.5 cursor-pointer active:scale-94'>
                  <button
                    aria-label='Upload profile image'
                    className='flex size-full items-center justify-center rounded-full disabled:cursor-wait'
                    disabled={profileStatus === 'saving' || isUploading}
                    type='button'
                    onClick={openFileDialog}>
                    <Icon
                      name={profileStatus === 'saving' || isUploading ? 'spinner-ring' : 'add'}
                      className='size-3'
                    />
                  </button>
                </AvatarBadge>
                <input
                  {...getInputProps({
                    'aria-label': 'Choose profile image',
                    className: 'hidden',
                    disabled: profileStatus === 'saving' || isUploading
                  })}
                />
              </Avatar>
              <div className='min-w-0'>
                <form onSubmit={saveProfile}>
                  <div className='mb-2 flex flex-wrap items-center gap-4'>
                    {editName ? (
                      <input
                        defaultValue={''}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder={displayName || 'Account Name'}
                        className='font-poly font-medium text-2xl placeholder:font-poly placeholder:font-medium placeholder:text-2xl w-54'
                      />
                    ) : (
                      <h1 className='truncate font-poly text-2xl font-medium tracking-tight sm:text-3xl'>
                        {displayName || 'Your account'}
                      </h1>
                    )}
                    {editName ? (
                      <button disabled={profileStatus === 'saving'} type='submit'>
                        <Icon name={profileStatus === 'saving' ? 'spinner-ring' : 'check'} />
                      </button>
                    ) : (
                      <Icon name='cf-pen' onClick={toggleEditName} />
                    )}
                  </div>
                </form>
                {profileError || profileImageError ? (
                  <div className='flex items-center space-x-4'>{profileError ?? profileImageError}</div>
                ) : (
                  <div className='flex items-center space-x-4'>
                    <p className='truncate text-sm text-muted-foreground'>{user.email ?? 'No email address'}</p>
                    {user.emailVerified ? (
                      <span className='inline-flex items-center gap-1 rounded-full bg-positive dark:bg-positive/40 text-white px-2 py-1 font-mono text-[10px] uppercase'>
                        <Icon name='check-circle-fill' className='size-3' /> Verified
                      </span>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
            <div className='flex-1 place-items-end'>
              <Stat label='Joined' value={formatDate(user.metadata.creationTime)} />
              {/*<Stat label='Sign-in' value={getProviderLabel(user)} />*/}
            </div>
          </div>
        </section>

        <div className='grid items-start gap-0 lg:grid-cols-[13rem_minmax(0,1fr)]'>
          <aside className='hidden lg:pt-4 lg:sticky lg:top-28 lg:block border-t border-border/50'>
            <nav className='space-y-1'>
              {navigationItems.map(({ href, icon, label }) => (
                <a
                  key={href}
                  className='group flex items-center gap-3 px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground'
                  href={href}>
                  <Icon name={icon} className='size-4' />
                  <span className='flex-1'>{label}</span>
                  <Icon name='chevron-right' className='size-3.5 opacity-0 transition-opacity group-hover:opacity-60' />
                </a>
              ))}
            </nav>
          </aside>

          <div className='min-w-0 space-y-0 mt-px'>
            <SettingsSection
              id='appearance'
              eyebrow='Preferences'
              title='Appearance & Motion'
              description='Personalize the workspace while keeping it comfortable to use.'>
              <div className='grid gap-3 sm:grid-cols-2'>
                <ThemeChoice
                  active={theme === 'light'}
                  icon={<Icon name='sun' />}
                  label='Light'
                  previewClassName='bg-[#f6f5f2] text-[#202020]'
                  onClick={() => setTheme('light')}
                />
                <ThemeChoice
                  active={theme === 'dark'}
                  icon={<Icon name='moon' className='size-4' />}
                  label='Dark'
                  previewClassName='bg-[#18181b] text-[#f4f4f5]'
                  onClick={() => setTheme('dark')}
                />
              </div>
              <PreferenceRow
                icon={<Icon name='floating' className='size-5' />}
                title='Reduce interface motion'
                description='Minimizes transitions, animated reveals, and theme effects.'>
                <Switch
                  aria-label='Reduce interface motion'
                  checked={motionPreference === 'reduced'}
                  onCheckedChange={(checked) => applyMotionPreference(checked ? 'reduced' : 'system')}
                />
              </PreferenceRow>
            </SettingsSection>

            <SettingsSection
              id='security'
              eyebrow='Account'
              title='Security'
              description='Review the identity provider and activity associated with this account.'>
              <div className='divide-y divide-border/60'>
                <InfoRow
                  icon={<Icon name='mail' />}
                  label='Email address'
                  value={
                    <div className='flex items-center space-x-2'>
                      <span>{user.email ?? 'Not provided'}</span>
                      <span className='font-mono text-xs uppercase '>
                        {user.emailVerified ? 'Verified' : 'Not verified'}
                      </span>
                    </div>
                  }
                />
                <InfoRow icon={<Icon name='safe-shield' />} label='Sign-in provider' value={getProviderLabel(user)} />
                {customClaimEntries.length > 0 ? (
                  <InfoRow
                    icon={<Icon name='keys' />}
                    label={`Access Roles`}
                    value={
                      <div className='flex items-center justify-end space-x-2'>
                        {customClaimEntries.map(([claim, value]) => (
                          <span
                            key={claim}
                            className={cn('font-mono text-xs uppercase tracking-widest', { 'opacity-40': !value })}>
                            {claim}
                          </span>
                        ))}
                      </div>
                    }
                  />
                ) : null}
                <InfoRow
                  icon={<Icon name='time' />}
                  label='Last sign-in'
                  value={
                    <span className='font-mono text-xs uppercase'>
                      {formatDateTime(user.metadata.lastSignInTime ?? null)}
                    </span>
                  }
                />
              </div>
              {customClaims.topg === true ? <TopgAdminAccessEditor user={user} /> : null}
              {customClaims.admin === true ? <AdminClaimEditor existingClaims={customClaims} user={user} /> : null}
              <div className='mt-5 flex flex-col gap-3 rounded-md border border-border/70 bg-muted/25 p-4 sm:flex-row sm:items-center sm:justify-between'>
                <div>
                  <p className='text-sm font-medium'>End this session</p>
                  <p className='mt-1 text-xs text-muted-foreground'>
                    You’ll return to the sign-in screen on this device.
                  </p>
                </div>
                <Button
                  className='gap-2 rounded-sm'
                  disabled={isSigningOut}
                  variant='outline'
                  onClick={() => void signOut()}>
                  <Icon name='logout' /> {isSigningOut ? 'Signing out…' : 'Sign out'}
                </Button>
              </div>
              {signOutError ? <p className='mt-3 text-sm text-destructive'>{signOutError}</p> : null}
            </SettingsSection>

            <SettingsSection
              id='data'
              eyebrow='Portability'
              title='Data Privacy'
              description='Download a portable snapshot of the account information available on this device.'>
              <div className='flex flex-col gap-4 rounded-md border border-border/70 bg-muted/25 p-4 sm:flex-row sm:items-center sm:justify-between'>
                <div className='flex items-start gap-3'>
                  <div className='mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-sm bg-background ring-1 ring-border/70'>
                    <Icon name='down-to-line' className='size-4' />
                  </div>
                  <div>
                    <p className='text-sm font-medium'>Export account data</p>
                    <p className='mt-0 max-w-lg text-xs leading-5 text-muted-foreground'>
                      Includes your profile, connected sign-in provider, account dates, and current preferences. It
                      never includes authentication tokens.
                    </p>
                  </div>
                </div>
                <Button className='gap-2 rounded-sm' variant='outline' onClick={exportAccountData}>
                  <Icon name='down-to-line' className='size-4' />
                  Download JSON
                </Button>
              </div>
            </SettingsSection>
          </div>
        </div>
      </div>
    </AccountShell>
  )
}

const SettingsSection = ({
  children,
  description,
  eyebrow,
  id,
  title
}: {
  children: ReactNode
  description: string
  eyebrow: string
  id: string
  title: string
}) => (
  <Card
    id={id}
    className='scroll-mt-24 rounded-none bg-transparent ring-0 md:ring-1 ring-border/70 gap-0 py-0 shadow-none backdrop-blur'>
    <CardHeader className='border-b border-border/60 px-5 py-5 sm:px-6 shadow-none'>
      <p className='font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground'>{eyebrow}</p>
      <CardTitle className='font-poly text-xl'>{title}</CardTitle>
      <CardDescription>{description}</CardDescription>
    </CardHeader>
    <CardContent className='px-5 py-5 sm:px-6 sm:py-6 border-0'>{children}</CardContent>
  </Card>
)

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className='p-1'>
    <p className='font-mono text-[9px] text-right uppercase tracking-[0.16em] text-muted-foreground'>{label}</p>
    <p className='mt-1 truncate text-xs font-medium'>{value}</p>
  </div>
)

const ThemeChoice = ({
  active,
  icon,
  label,
  onClick,
  previewClassName
}: {
  active: boolean
  icon: ReactNode
  label: string
  onClick: VoidFunction
  previewClassName: string
}) => (
  <button
    aria-pressed={active}
    className={cn(
      'rounded-xl border p-2 text-left transition-colors',
      active ? 'border-foreground/40 bg-foreground/4' : 'border-border/70 hover:bg-muted/40'
    )}
    type='button'
    onClick={onClick}>
    <div className={cn('h-24 overflow-hidden rounded-lg p-3 ring-1 ring-black/10', previewClassName)}>
      <div className='flex items-center justify-between'>
        <div className='h-2 w-12 rounded-full bg-current opacity-20' />
        <span className='[&_svg]:size-5'>{icon}</span>
      </div>
      <div className='mt-6 grid grid-cols-[2rem_1fr] gap-2'>
        <div className='h-9 rounded-md bg-current opacity-10' />
        <div className='space-y-2 pt-1'>
          <div className='h-2 w-3/4 rounded-full bg-current opacity-25' />
          <div className='h-2 w-1/2 rounded-full bg-current opacity-15' />
        </div>
      </div>
    </div>
    <div className='flex items-center justify-between px-1 pb-1 pt-3'>
      <span className='text-sm font-medium'>{label}</span>
      <span className={cn('size-2 rounded-full', active ? 'bg-positive' : 'bg-muted-foreground/25')} />
    </div>
  </button>
)

const PreferenceRow = ({
  children,
  description,
  icon,
  title
}: {
  children: ReactNode
  description: string
  icon: ReactNode
  title: string
}) => (
  <div className='mt-5 flex items-center gap-3 rounded-md border border-border/70 bg-muted/25 p-4'>
    <div className='flex size-9 shrink-0 items-center justify-center rounded-sm bg-background ring-1 ring-border/70'>
      {icon}
    </div>
    <div className='min-w-0 flex-1'>
      <p className='text-sm font-medium'>{title}</p>
      <p className='mt-0 text-xs leading-5 text-muted-foreground'>{description}</p>
    </div>
    {children}
  </div>
)

const AdminClaimEditor = ({ existingClaims, user }: { existingClaims: FirebaseCustomClaims; user: User }) => {
  const canAddClaims = canReceiveFirebaseClaimGrant(user)
  const [claimName, setClaimName] = useState('')
  const [claimValue, setClaimValue] = useState('true')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const addClaim = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!canAddClaims) {
      setError('Verify your Firebase email before adding custom claims.')
      setStatus('error')
      return
    }

    setError(null)
    setStatus('saving')

    const name = claimName.trim()

    if (isPrivilegedFirebaseCustomClaimName(name)) {
      setError('Use the dedicated access controls to manage admin, snap-admin, or topg claims.')
      setStatus('error')
      return
    }

    if (!isFirebaseCustomClaimName(name)) {
      setError('Use a non-reserved claim name with letters, numbers, dots, underscores, or hyphens.')
      setStatus('error')
      return
    }

    if (Object.hasOwn(existingClaims, name)) {
      setError(`The claim “${name}” already exists.`)
      setStatus('error')
      return
    }

    let value: unknown

    try {
      value = JSON.parse(claimValue)
    } catch {
      setError('Enter a valid JSON value, such as true, 3, "staff", or ["editor"].')
      setStatus('error')
      return
    }

    if (!isFirebaseCustomClaimValue(value)) {
      setError('The claim value must be valid JSON.')
      setStatus('error')
      return
    }

    let claimWasAdded = false

    try {
      await createFirebaseSession(await user.getIdToken())

      const response = await fetch('/api/auth/custom-claims', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name, value })
      })
      const result = (await response.json().catch(() => ({}))) as AddCustomClaimResponse

      if (!response.ok) {
        throw new Error(typeof result.error === 'string' ? result.error : 'Unable to add the custom claim.')
      }

      claimWasAdded = true
      await createFirebaseSession(await user.getIdToken(true))
      setClaimName('')
      setClaimValue('true')
      setStatus('saved')
    } catch (claimError) {
      const message = claimError instanceof Error ? claimError.message : 'Unable to add the custom claim.'
      setError(claimWasAdded ? `Claim added, but the session refresh failed. Refresh the page. ${message}` : message)
      setStatus('error')
    }
  }

  return (
    <form className='mt-5 rounded-md border border-border/70 bg-muted/25 p-4' onSubmit={addClaim}>
      <div className='flex items-start gap-3'>
        <div className='flex size-9 shrink-0 items-center justify-center rounded-sm bg-background ring-1 ring-border/70'>
          <Icon name='add' className='size-4' />
        </div>
        <div>
          <p className='text-sm font-medium'>Add Roles</p>
          <p className='mt-0 text-xs leading-5 text-muted-foreground'>
            {canAddClaims
              ? 'Adds a new Firebase claim to your administrator account. Existing claims cannot be overwritten here.'
              : 'Verify your Firebase email before adding custom claims.'}
          </p>
        </div>
      </div>
      <div className='mt-4 grid gap-3 sm:grid-cols-2'>
        <label className='space-y-1.5 text-xs font-medium'>
          <span>Claim name</span>
          <input
            autoComplete='off'
            className='h-9 w-full rounded-sm border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50'
            disabled={status === 'saving' || !canAddClaims}
            placeholder='role'
            value={claimName}
            onChange={(event) => {
              setClaimName(event.target.value)
              setStatus('idle')
            }}
          />
        </label>
        <label className='space-y-1.5 text-xs font-medium'>
          <span>JSON value</span>
          <input
            autoComplete='off'
            className='h-9 w-full rounded-sm border border-border bg-background px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50'
            disabled={status === 'saving' || !canAddClaims}
            placeholder='"staff"'
            value={claimValue}
            onChange={(event) => {
              setClaimValue(event.target.value)
              setStatus('idle')
            }}
          />
        </label>
      </div>
      <div className='mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <p aria-live='polite' className='text-xs'>
          {error ? (
            <span className='text-destructive'>{error}</span>
          ) : status === 'saved' ? (
            <span className='text-positive'>Claim added and token refreshed.</span>
          ) : !canAddClaims ? (
            <span className='text-muted-foreground'>Email verification is required for every claim grant.</span>
          ) : (
            <span className='text-muted-foreground'>Values use JSON syntax.</span>
          )}
        </p>
        <Button disabled={!canAddClaims || status === 'saving' || !claimName.trim()} size='sm' type='submit'>
          {status === 'saving' ? 'Adding…' : 'Add claim'}
        </Button>
      </div>
    </form>
  )
}

const TopgAdminAccessEditor = ({ user }: { user: User }) => {
  const router = useRouter()
  const [targetType, setTargetType] = useState<'email' | 'uid'>('email')
  const [target, setTarget] = useState('')
  const [pendingAction, setPendingAction] = useState<'grant' | 'revoke' | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const updateAdminAccess = async (action: 'grant' | 'revoke') => {
    const normalizedTarget = target.trim()

    if (!normalizedTarget || pendingAction) return

    setError(null)
    setMessage(null)
    setPendingAction(action)

    try {
      await createFirebaseSession(await user.getIdToken())

      const response = await fetch('/api/auth/admin-claims', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action, target: normalizedTarget, targetType })
      })
      const result = (await response.json().catch(() => ({}))) as AdminClaimResponse

      if (!response.ok || typeof result.targetUid !== 'string') {
        throw new Error(typeof result.error === 'string' ? result.error : 'Unable to update admin access.')
      }

      const isCurrentUser = result.targetUid === user.uid

      if (isCurrentUser && action === 'revoke') {
        await clearFirebaseSession().catch(() => undefined)
        await signOutUser()
        router.replace('/')
        return
      }

      if (isCurrentUser) {
        await createFirebaseSession(await user.getIdToken(true))
      }

      const targetLabel = result.targetEmail || result.targetUid
      const updateLabel = result.changed
        ? action === 'grant'
          ? 'granted to'
          : 'revoked from'
        : action === 'grant'
          ? 'was already granted to'
          : 'was already absent from'
      setMessage(
        `Admin access ${updateLabel} ${targetLabel}.${
          !isCurrentUser && action === 'grant' ? ' Their token will include it after its next refresh.' : ''
        }`
      )
      setTarget('')
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : 'Unable to update admin access.')
    } finally {
      setPendingAction(null)
    }
  }

  return (
    <div className='mt-5 rounded-md border border-border/70 bg-muted/25 p-4'>
      <div className='flex items-start gap-3'>
        <div className='flex size-9 shrink-0 items-center justify-center rounded-sm bg-background ring-1 ring-border/70'>
          <Icon name='settings-outline' className='size-4' />
        </div>
        <div>
          <p className='text-sm font-medium'>Manage Admins</p>
          <p className='mt-0 text-xs leading-5 text-muted-foreground'>
            This control is available only to accounts whose current Firebase record has the topg claim. Targets must
            have a verified Firebase email before access can be granted.
          </p>
        </div>
      </div>
      <div className='mt-4 grid sm:grid-cols-[16rem_minmax(0,1fr)] gap-3'>
        <label className='space-y-1.5 text-xs font-medium'>
          <span>Find by</span>
          <select
            className='h-9 w-full rounded-sm border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50'
            disabled={pendingAction !== null}
            value={targetType}
            onChange={(event) => {
              setTargetType(event.target.value === 'uid' ? 'uid' : 'email')
              setError(null)
              setMessage(null)
            }}>
            <option value='email'>Email</option>
            <option value='uid'>Firebase UID</option>
          </select>
        </label>
        <label className='space-y-1.5 text-xs font-medium'>
          <span>{targetType === 'email' ? 'Email' : 'UID'}</span>
          <input
            autoComplete='off'
            className='h-9 w-full rounded-sm border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50'
            disabled={pendingAction !== null}
            inputMode={targetType === 'email' ? 'email' : 'text'}
            placeholder={targetType === 'email' ? 'admin@example.com' : 'UID'}
            type={targetType === 'email' ? 'email' : 'text'}
            value={target}
            onChange={(event) => {
              setTarget(event.target.value)
              setError(null)
              setMessage(null)
            }}
          />
        </label>
      </div>
      <div className='mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <p aria-live='polite' className='text-xs'>
          {error ? (
            <span className='text-destructive'>{error}</span>
          ) : message ? (
            <span className='text-positive'>{message}</span>
          ) : (
            <span className='text-muted-foreground'>
              Revoking admin access invalidates the target’s active sessions.
            </span>
          )}
        </p>
        <div className='flex gap-2'>
          <Button
            disabled={pendingAction !== null || !target.trim()}
            size='sm'
            type='button'
            variant='outline'
            onClick={() => void updateAdminAccess('revoke')}>
            {pendingAction === 'revoke' ? 'Revoking…' : 'Revoke Admin'}
          </Button>
          <Button
            disabled={pendingAction !== null || !target.trim()}
            size='sm'
            type='button'
            onClick={() => void updateAdminAccess('grant')}>
            {pendingAction === 'grant' ? 'Granting…' : 'Grant Admin'}
          </Button>
        </div>
      </div>
    </div>
  )
}

const InfoRow = ({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) => (
  <div className='grid gap-2 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,auto)] sm:items-center'>
    <div className='flex items-center gap-3'>
      <span className='flex size-8 items-center justify-center rounded-sm bg-muted/60 text-muted-foreground [&_svg]:size-4'>
        {icon}
      </span>
      <span className='text-sm text-muted-foreground'>{label}</span>
    </div>
    <span className='break-all pl-11 text-sm font-medium sm:pl-0 sm:text-right'>{value}</span>
  </div>
)
