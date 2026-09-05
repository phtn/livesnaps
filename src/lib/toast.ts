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

let nextToastId = 0
let records: ToastRecord[] = []
const listeners = new Set<() => void>()

const notify = () => listeners.forEach((listener) => listener())
export const subscribeToToasts = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export const getToasts = () => records

const addToast = (kind: ToastKind, message: OctaneNode, options?: ToastOptions) => {
  const id = options?.id ?? `toast-${++nextToastId}`
  records = records.filter((record) => record.id !== id)
  records = [...records, { id, kind, message, dismissed: false }]
  notify()
  if (options?.duration !== Infinity) window.setTimeout(() => dismissToast(id), options?.duration ?? 4000)
  return id
}

const updateToast = (id: string, kind: ToastKind, message: OctaneNode) => {
  records = records.map((record) => (record.id === id ? { ...record, kind, message, dismissed: false } : record))
  notify()
}

export const onSuccess = (message: string, options?: ToastOptions) => addToast('success', message, options)
export const onInfo = (message: string, options?: ToastOptions) => addToast('info', message, options)
export const onWarn = (message: string, options?: ToastOptions) => addToast('warning', message, options)
export const onError = (message: string, options?: ToastOptions) => addToast('error', message, options)
export const onLoading = (message: string, options?: ToastOptions) => addToast('loading', message, options)

export function onPromise<T>(
  promise: Promise<T>,
  messages: PromiseToastMessages<T>,
  options?: ToastOptions
): Promise<T> {
  const id = addToast('loading', messages.loading, { ...options, duration: Infinity })
  return promise
    .then((value) => {
      updateToast(id, 'success', typeof messages.success === 'function' ? messages.success(value) : messages.success)
      window.setTimeout(() => dismissToast(id), options?.duration ?? 4000)
      return value
    })
    .catch((error) => {
      updateToast(id, 'error', typeof messages.error === 'function' ? messages.error(error) : messages.error)
      window.setTimeout(() => dismissToast(id), options?.duration ?? 4000)
      throw error
    })
}

export const dismissToast = (id?: string) => {
  records = records.map((record) => (!id || record.id === id ? { ...record, dismissed: true } : record))
  notify()
  window.setTimeout(() => removeToast(id), 180)
}
export const removeToast = (id?: string) => {
  records = id ? records.filter((record) => record.id !== id) : []
  notify()
}
