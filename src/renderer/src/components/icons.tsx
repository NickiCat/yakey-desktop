import type { SVGProps } from 'react'

function Icon(props: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  )
}

export const IconGear = (): JSX.Element => (
  <Icon>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </Icon>
)

export const IconCopy = (): JSX.Element => (
  <Icon>
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </Icon>
)

export const IconCheck = (): JSX.Element => (
  <Icon>
    <path d="M20 6 9 17l-5-5" />
  </Icon>
)

export const IconLock = (): JSX.Element => (
  <Icon>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Icon>
)

export const IconMinus = (): JSX.Element => (
  <Icon>
    <path d="M5 12h14" />
  </Icon>
)

export const IconX = (): JSX.Element => (
  <Icon>
    <path d="M18 6 6 18M6 6l12 12" />
  </Icon>
)

export const IconPlus = (): JSX.Element => (
  <Icon>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)

export const IconCloud = (): JSX.Element => (
  <Icon>
    <path d="M17.5 19a4.5 4.5 0 1 0-1.2-8.84A6 6 0 0 0 5 12.5 3.5 3.5 0 0 0 6.5 19z" />
    <path d="M12 12v6M9.5 15.5 12 18l2.5-2.5" />
  </Icon>
)

export const IconPanel = (): JSX.Element => (
  <Icon>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
  </Icon>
)

export const IconTerminal = (): JSX.Element => (
  <Icon>
    <path d="m5 8 4 4-4 4M12 16h7" />
  </Icon>
)

export const IconTrash = (): JSX.Element => (
  <Icon>
    <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
  </Icon>
)

export const IconExport = (): JSX.Element => (
  <Icon>
    <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" />
    <path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
  </Icon>
)

export const IconKey = (): JSX.Element => (
  <Icon>
    <circle cx="7.5" cy="15.5" r="4.5" />
    <path d="m10.7 12.3 9.3-9.3M17 6l3 3M14.5 8.5l2 2" />
  </Icon>
)

export const IconCaret = (): JSX.Element => (
  <svg className="v-select-caret" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
    <path d="m2 3.5 3 3 3-3" />
  </svg>
)

export const IconFingerprint = (): JSX.Element => (
  <Icon>
    <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
    <path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
    <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" />
    <path d="M2 12a10 10 0 0 1 18-6" />
    <path d="M2 16h.01" />
    <path d="M21.8 16c.2-2 .131-5.354 0-6" />
    <path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2" />
    <path d="M8.65 22c.21-.66.45-1.32.57-2" />
    <path d="M9 6.8a6 6 0 0 1 9 5.2v2" />
  </Icon>
)

/** Лого yakey: тот же знак, что в resources/icon.svg. */
export const Logo = ({ size = 18 }: { size?: number }): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
    <rect x="16" y="16" width="480" height="480" rx="108" fill="#0a0a0a" stroke="#333333" strokeWidth="12" />
    <g transform="translate(8 8)" fill="none" stroke="#ededed" strokeWidth="40" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="184" cy="312" r="72" />
      <path d="M235 261 384 112M336 160 384 208M296 200 328 232" />
    </g>
  </svg>
)
