/**
 * The data contract for `list.btsx`.
 *
 * It lives in a `.ts` sibling rather than in the component's own `module`
 * block because `*.btsx` is declared to TypeScript with a default export only —
 * a `.ts` consumer cannot name a type that a `.btsx` exports.
 */

export type CardTone = 'crown' | 'tide' | 'paper'

/** `carousel` is the marketing shelf; `grid` is a picker that stays put. */
export type CardListLayout = 'carousel' | 'grid'

/**
 * The value shown at the end of a card's footer row. Cards own the styling of
 * each kind, so a caller passes data rather than markup.
 */
export type CardTrailing = { kind: 'score'; value: string } | { kind: 'badge'; value: string }

export interface CardListItem {
  id: string
  title: string
  subtitle?: string
  tone: CardTone
  /** A single character drawn large on the cover. */
  glyph: string
  /** Pinned over the top-left of the cover. */
  badge?: string
  trailing?: CardTrailing
}

export interface CardListHeading {
  eyebrow?: string
  title: string
  /** The trailing link is only drawn when it has a label to draw. */
  actionLabel?: string
  onAction?: () => void
}

export interface CardListProps {
  items: readonly CardListItem[]
  layout?: CardListLayout
  heading?: CardListHeading
  id?: string
  className?: string
  /** Marks one card as chosen; the cards are toggles rather than links. */
  selectedId?: string | null
  onSelect?: (id: string) => void
}

/** The editorial shelf this component shipped with. */
export interface Game {
  title: string
  genre: string
  score: string
  tone: string
  glyph: string
  badge?: string
}

const CARD_TONES = ['crown', 'tide', 'paper'] as const

/** Cycles the three covers, so a caller with no tone of its own still varies. */
export const cardToneForIndex = (index: number): CardTone => CARD_TONES[index % CARD_TONES.length]

const isCardTone = (value: string): value is CardTone => (CARD_TONES as readonly string[]).includes(value)

export const gamesToCardItems = (games: readonly Game[]): CardListItem[] =>
  games.map((game, index) => ({
    id: game.title,
    title: game.title,
    subtitle: game.genre,
    tone: isCardTone(game.tone) ? game.tone : cardToneForIndex(index),
    glyph: game.glyph,
    ...(game.badge ? { badge: game.badge } : {}),
    trailing: { kind: 'score', value: game.score }
  }))
