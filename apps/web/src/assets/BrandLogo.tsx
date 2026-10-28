import symbol from './brand/educore-symbol-candidate.svg'
import horizontal from './brand/educore-horizontal-candidate.svg'

// PROPOSED brand candidates. Deliberately not mounted in the application shell
// or index.html until owner review. Compact and favicon share the symbol file.
const brandCandidates = { symbol, compact: symbol, horizontal, favicon: symbol } as const

export function BrandLogo({ variant = 'horizontal', decorative = false }: {
  variant?: 'symbol' | 'compact' | 'horizontal'; decorative?: boolean
}) {
  return <img src={brandCandidates[variant]} alt={decorative ? '' : 'EduCore'}
    width={variant === 'horizontal' ? 108 : 32} height={32} />
}
