/**
 * The shared vocabulary of the verification step pipeline.
 *
 * The create drawer and the send drawer are the same walk through the same
 * entry, so the tones, the motion, and the attachment arithmetic live here
 * rather than being written twice. Components import the values; `.btsx`
 * modules cannot export to one another, which is why this is a `.ts` sibling.
 */

/**
 * A step is `done` once the operator has settled it, `active` while it is the
 * one thing left to do, and `idle` while an earlier step still blocks it.
 */
export type StepState = 'idle' | 'active' | 'done'

export const STEP_TILE_CLASS = {
  idle: 'border border-border/40 bg-muted/40 text-muted-foreground/50',
  active: 'bg-active text-white shadow-[0_3px_10px_-3px_var(--color-active)]',
  done: 'border border-[#01bf7c]/96 bg-[#01bf7c]/96 text-white'
} as const satisfies Record<StepState, string>

export const STEP_TITLE_CLASS = {
  idle: 'text-muted-foreground/50',
  active: 'text-foreground',
  done: 'text-foreground'
} as const satisfies Record<StepState, string>

/**
 * Settling one step usually settles the ones after it in the same frame. The
 * stagger spreads that into a run down the rail so the operator sees the
 * pipeline advance rather than a column of tiles flipping at once.
 */
export const STEP_FLOW_MS = 110

/**
 * Every branch that swaps in when a step settles enters the same way, so the
 * pipeline reads as one motion rather than several unrelated ones.
 */
export const ENTER_CLASS = 'animate-in fade-in-0 slide-in-from-top-1 duration-300 ease-out motion-reduce:animate-none'

// Ranked rows borrow the reference card's three-tone ladder, so the first
// attachment reads as the primary one at a glance.
const RANK_TONES = ['bg-active', 'bg-violet-500', 'bg-pink-500'] as const
const RANK_TEXT_TONES = ['text-active', 'text-violet-500', 'text-pink-500'] as const

export const rankTone = (index: number) => RANK_TONES[index % RANK_TONES.length]
export const rankTextTone = (index: number) => RANK_TEXT_TONES[index % RANK_TEXT_TONES.length]

export const fieldLabelClassName = 'font-mono text-2xs uppercase tracking-[0.14em] text-muted-foreground'
export const readonlyFieldClassName =
  'flex h-9 items-center truncate rounded-xs border border-border/40 bg-muted/40 px-3 font-mono text-xs text-muted-foreground'
export const ghostButtonClassName =
  'inline-flex cursor-pointer items-center justify-center rounded-md outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50'
export const errorTextClassName = 'font-mono text-2xs text-destructive'

export const CONTENT_BASE_CLASS =
  'fixed z-50 flex flex-col overflow-hidden border border-border/50 bg-sidebar text-foreground shadow-2xl outline-none'
export const CONTENT_BOTTOM_CLASS = 'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl'
export const CONTENT_RIGHT_CLASS = 'inset-y-0 right-0 w-full max-w-[38rem] rounded-l-2xl'

/** The shape either drawer needs to weigh an attachment: just the evidence. */
export interface AttachmentSource {
  photos: readonly { size: number }[]
}

// The report is generated rather than stored, so its weight is projected from
// the shape of the snap: a fixed body plus one evidence block per photo. The
// photos attachment, by contrast, is the bytes already sitting in R2.
const REPORT_BASE_BYTES = 48_000
const REPORT_PER_PHOTO_BYTES = 5_200

export const formatBytes = (bytes: number) => {
  if (bytes <= 0) return '0 kb'
  if (bytes < 1_000) return `${bytes} b`
  if (bytes < 1_000_000) return `${Math.round(bytes / 1_000)} kb`
  return `${(bytes / 1_000_000).toFixed(1)} mb`
}

export const attachmentBytes = (option: string, source: AttachmentSource) => {
  if (option === 'photos') return source.photos.reduce((total, photo) => total + photo.size, 0)
  if (option === 'full report') return REPORT_BASE_BYTES + source.photos.length * REPORT_PER_PHOTO_BYTES
  return 0
}

/**
 * The size shown at the end of an attachment row. `isEstimate` marks a value
 * that is projected rather than measured, so the row can say so with a `~`.
 * Without a snap to read there is nothing to weigh, hence the dash.
 */
export const attachmentSize = (
  option: string,
  source: AttachmentSource | null
): { label: string; isEstimate: boolean } =>
  source === null
    ? { label: '—', isEstimate: false }
    : { label: formatBytes(attachmentBytes(option, source)), isEstimate: option === 'full report' }

/** The running weight of what is selected, or `null` when nothing is. */
export const attachmentTotalLabel = (
  selected: readonly string[],
  known: readonly string[],
  source: AttachmentSource | null
) => {
  const included = known.filter((option) => selected.includes(option))
  if (source === null || included.length === 0) return null

  return formatBytes(included.reduce((total, option) => total + attachmentBytes(option, source), 0))
}
