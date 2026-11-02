const NAMES: Record<string, string> = {
  thumb: 'большой',
  'index-finger': 'указательный',
  'middle-finger': 'средний',
  'ring-finger': 'безымянный',
  'little-finger': 'мизинец'
}

/** right-index-finger → «Правый указательный». */
export function fingerLabel(f: string): string {
  const m = /^(left|right)-(.+)$/.exec(f)
  if (!m || !NAMES[m[2]]) return f
  return `${m[1] === 'left' ? 'Левый' : 'Правый'} ${NAMES[m[2]]}`
}
