import type { OctaneNode } from 'octane'

export type ToastKind = 'info' | 'success' | 'warning' | 'error' | 'loading'
export interface ToastOptions {
  duration?: number
  id?: string
}
export interface PromiseToastMessages<T> {
  loading: OctaneNode
  success: OctaneNode | ((value: T) => OctaneNode)
  error: OctaneNode | ((error: unknown) => OctaneNode)
}
export interface ToastRecord {
  id: string
  kind: ToastKind
  message: OctaneNode
  dismissed: boolean
}

const DEFAULT_DURATION_MS = 4000
// Matches the fade in `toasts.btsx`; a dismissed record stays mounted this long.
const EXIT_DURATION_MS = 180

let nextToastId = 0
let records: ToastRecord[] = []
const listeners = new Set<() => void>()
// One pending timer per toast, whether it is waiting to dismiss or to remove.
// Any change to a toast clears its timer, so a stale one can't close a
// replacement that reuses the id.
const timers = new Map<string, number>()

const notify = () =>
  listeners.forEach((listener) => {
    listener()
  })
export const subscribeToToasts = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export const getToasts = () => records

const clearTimer = (id: string) => {
  const timer = timers.get(id)
  if (timer === undefined) return
  window.clearTimeout(timer)
  timers.delete(id)
}

const schedule = (id: string, delay: number, callback: () => void) => {
  clearTimer(id)
  if (delay === Infinity) return
  timers.set(
    id,
    window.setTimeout(() => {
      timers.delete(id)
      callback()
    }, delay)
  )
}

const addToast = (kind: ToastKind, message: OctaneNode, options?: ToastOptions) => {
  const id = options?.id ?? `toast-${++nextToastId}`
  records = [...records.filter((record) => record.id !== id), { id, kind, message, dismissed: false }]
  notify()
  const defaultDuration = kind === 'loading' ? Infinity : DEFAULT_DURATION_MS
  schedule(id, options?.duration ?? defaultDuration, () => dismissToast(id))
  return id
}

const updateToast = (id: string, kind: ToastKind, message: OctaneNode, duration: number) => {
  if (!records.some((record) => record.id === id)) return
  records = records.map((record) => (record.id === id ? { ...record, kind, message, dismissed: false } : record))
  notify()
  schedule(id, duration, () => dismissToast(id))
}

export const onSuccess = (message: OctaneNode, options?: ToastOptions) => addToast('success', message, options)
export const onInfo = (message: OctaneNode, options?: ToastOptions) => addToast('info', message, options)
export const onWarn = (message: OctaneNode, options?: ToastOptions) => addToast('warning', message, options)
export const onError = (message: OctaneNode, options?: ToastOptions) => addToast('error', message, options)
export const onLoading = (message: OctaneNode, options?: ToastOptions) => addToast('loading', message, options)

export function onPromise<T>(
  promise: Promise<T>,
  messages: PromiseToastMessages<T>,
  options?: ToastOptions
): Promise<T> {
  const id = addToast('loading', messages.loading, { ...options, duration: Infinity })
  const duration = options?.duration ?? DEFAULT_DURATION_MS
  return promise.then(
    (value) => {
      updateToast(id, 'success', typeof messages.success === 'function' ? messages.success(value) : messages.success, duration)
      return value
    },
    (error: unknown) => {
      updateToast(id, 'error', typeof messages.error === 'function' ? messages.error(error) : messages.error, duration)
      throw error
    }
  )
}

export const dismissToast = (id?: string) => {
  // Snapshot the targets so toasts added during the exit fade survive it.
  const ids = records.filter((record) => (id ? record.id === id : true) && !record.dismissed).map((record) => record.id)
  if (ids.length === 0) return
  records = records.map((record) => (ids.includes(record.id) ? { ...record, dismissed: true } : record))
  notify()
  ids.forEach((target) => schedule(target, EXIT_DURATION_MS, () => removeToast(target)))
}

export const removeToast = (id?: string) => {
  const ids = id ? [id] : records.map((record) => record.id)
  ids.forEach(clearTimer)
  records = records.filter((record) => !ids.includes(record.id))
  notify()
}
