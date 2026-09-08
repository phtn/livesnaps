import type { OctaneNode } from 'octane'

type Component<P = {}> = (props: P) => OctaneNode
export type ComponentProps<T> = T extends Component<infer P> ? P : never

type O<T> = {
  current: T | null
}
export type RefObject<T> = O<T>
