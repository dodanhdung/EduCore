import type { CSSProperties } from 'react'
import overview from './navigation/overview.svg'
import people from './navigation/people.svg'
import classes from './navigation/classes.svg'
import teaching from './navigation/teaching.svg'
import finance from './navigation/finance.svg'
import settings from './navigation/settings.svg'
import search from './actions/search.svg'
import notifications from './actions/notifications.svg'
import chevronDown from './actions/chevron-down.svg'
import check from './actions/check.svg'
import refresh from './actions/refresh.svg'
import './asset-icons.css'

// Keep the exported SVGs intact. The mask inherits the consumer's text color;
// each glyph keeps its native proportions inside a consistent 20px slot.
const assetIcons = {
  overview: { src: overview, width: 15, height: 15 },
  people: { src: people, width: 18.3333, height: 15 },
  classes: { src: classes, width: 15, height: 16.6667 },
  teaching: { src: teaching, width: 16.6667, height: 16.6667 },
  finance: { src: finance, width: 15.8333, height: 15 },
  settings: { src: settings, width: 16.75, height: 16.6667 },
  search: { src: search, width: 15, height: 15 },
  notifications: { src: notifications, width: 13.3333, height: 16.6667 },
  'chevron-down': { src: chevronDown, width: 8, height: 4.93333 },
  check: { src: check, width: 12.225, height: 9.01875 },
  refresh: { src: refresh, width: 12, height: 12 },
} as const

export type AssetIconName = keyof typeof assetIcons

export function AssetIcon({ name, size = 20, label, className = '' }: {
  name: AssetIconName; size?: 16 | 20 | 24; label?: string; className?: string
}) {
  const icon = assetIcons[name]
  const style: CSSProperties = {
    width: size, height: size,
    maskImage: `url("${icon.src}")`, WebkitMaskImage: `url("${icon.src}")`,
    maskSize: `${icon.width * size / 20}px ${icon.height * size / 20}px`,
    WebkitMaskSize: `${icon.width * size / 20}px ${icon.height * size / 20}px`,
  }
  return <span className={`ec-asset-icon ${className}`.trim()} style={style}
    role={label ? 'img' : undefined} aria-label={label || undefined}
    aria-hidden={label ? undefined : true} data-asset-icon={name} />
}
