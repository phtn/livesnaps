import type { CSSProperties, ReactElement } from 'react'
import { Toaster, toast, type ToastOptions } from 'react-hot-toast'

const BASE_TOAST_STYLE = {
  background: '#000000',
  color: 'white',
  padding: '4px 10px',
  letterSpacing: '-0.50px',
  fontFamily: 'Okxs'
} satisfies CSSProperties

const TOAST_STYLE_SM = {
  ...BASE_TOAST_STYLE,
  fontSize: '12px'
} satisfies CSSProperties

const TOAST_STYLE_MD = {
  ...BASE_TOAST_STYLE,
  fontSize: '14px'
} satisfies CSSProperties

// `react-hot-toast`'s `Renderable` type does not include `undefined`, so we keep
// this intentionally narrow (and avoid `ReactNode` which includes `undefined`).
type ToastMessage = string | ReactElement | null
type PromiseToastMessages<T> = {
  loading: ToastMessage
  success: ToastMessage | ((value: T) => ToastMessage)
  error: ToastMessage | ((err: unknown) => ToastMessage)
}

/**
 * @name onSuccess
 * @description Show a success toast. Use for completed actions that succeeded.
 * @param msg - The message to display.
 * @param options - Optional `react-hot-toast` options (e.g. duration, id, icon, style).
 * @returns The toast id.
 */
export const onSuccess = (msg: string, options?: ToastOptions) => toast.success(msg, options)

/**
 * @name onInfo
 * @description Show an informational toast with the app's base styling.
 * @param msg - The message to display.
 * @param options - Optional `react-hot-toast` options (e.g. duration, id, icon, style).
 * @returns The toast id.
 */
export const onInfo = (msg: string, options?: ToastOptions) => toast(msg, { style: TOAST_STYLE_MD, ...options })

/**
 * @name onWarn
 * @description Show a warning toast (amber icon theme) with the app's base styling.
 * @param msg - The message to display.
 * @param options - Optional `react-hot-toast` options (e.g. duration, id, icon, style).
 * @returns The toast id.
 */
export const onWarn = (msg: string, options?: ToastOptions) =>
  toast(msg, {
    iconTheme: {
      primary: '#f59e0b',
      secondary: '#fffbeb'
    },
    style: TOAST_STYLE_MD,
    ...options
  })

/**
 * @name onError
 * @description Show an error toast. Use for failed actions and exceptions you want the user to see.
 * @param msg - The message to display.
 * @param options - Optional `react-hot-toast` options (e.g. duration, id, icon, style).
 * @returns The toast id.
 */
export const onError = (msg: string, options?: ToastOptions) => toast.error(msg, options)

/**
 * @name onLoading
 * @description Show a loading toast. Use for long-running async work when you want immediate feedback.
 * @param msg - The message to display.
 * @param options - Optional `react-hot-toast` options (e.g. duration, id, icon, style).
 * @returns The toast id.
 */
export const onLoading = (msg: string, options?: ToastOptions) =>
  toast.loading(msg, { style: TOAST_STYLE_SM, ...options })

/**
 * @name onPromise
 * @description Show a loading toast for a promise and automatically update it on success/error.
 * The returned value is the original promise, so you can `await` it normally.
 * @param promise - The promise to track.
 * @param messages - Messages for each state: loading, success, error. `success` can be a function of the resolved value.
 * @param options - Optional `react-hot-toast` options (e.g. id to ensure replacement, duration, style).
 * @returns The original promise (passes through its resolved value / rejection).
 */
export function onPromise<T>(
  promise: Promise<T>,
  messages: PromiseToastMessages<T>,
  options?: ToastOptions
): Promise<T> {
  return toast.promise(
    promise,
    {
      loading: messages.loading,
      success: messages.success,
      error: messages.error
    },
    options
  )
}

/**
 * @name dismissToast
 * @description Dismiss one toast by id (or all toasts if id is omitted). Dismiss hides the toast with exit animation.
 * @param toastId - Optional toast id to dismiss.
 * @returns void.
 */
export const dismissToast = (toastId?: string) => toast.dismiss(toastId)

/**
 * @name removeToast
 * @description Remove one toast by id (or all toasts if id is omitted). Remove clears immediately (no exit animation).
 * @param toastId - Optional toast id to remove.
 * @returns void.
 */
export const removeToast = (toastId?: string) => toast.remove(toastId)

/**
 * @name Toasts
 * @description App-level toast renderer. Mount this once (typically near the root layout) to enable toasts.
 * @returns A `react-hot-toast` `<Toaster />` with app defaults.
 */
export const Toasts = () => {
  return (
    <Toaster
      gutter={4}
      toastOptions={{
        position: 'top-center',
        duration: 4000,
        success: {
          style: {
            ...TOAST_STYLE_MD
          },
          iconTheme: {
            primary: '#10b981',
            secondary: '#d1fae5'
          }
        },
        error: {
          style: {
            margin: '2px 0px',
            ...TOAST_STYLE_SM
          }
        },
        loading: {
          style: {
            ...TOAST_STYLE_SM
          },
          iconTheme: {
            primary: '#fde68a',
            secondary: '#52525b'
          }
        }
      }}
    />
  )
}
