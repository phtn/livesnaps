import { createContext, use } from 'octane'

export interface HandlerOptions {
  canManage: boolean
  members: { id: string; name: string; email: string }[]
}

export interface SnapHandlerContextValue {
  options: HandlerOptions
  refresh: () => void
}

export const SnapHandlerContext = createContext<SnapHandlerContextValue | null>(null)
export const useSnapHandlerContext = () => use(SnapHandlerContext)
