import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve, dirname, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const requireWeb = createRequire(resolve(root, 'apps/web/package.json'))
const { JSDOM } = requireWeb('jsdom')
const inventory = JSON.parse(readFileSync(resolve(root, 'apps/web/src/assets/asset-inventory.json'), 'utf8'))

function inspect(svg, file) {
  assert(!/<!DOCTYPE|<!ENTITY/i.test(svg), `${file}: XML declarations/entities forbidden`)
  const dom = new JSDOM(svg, { contentType: 'image/svg+xml' })
  try {
    const el = dom.window.document.documentElement
    assert.equal(el.localName, 'svg', `${file}: SVG root required`)
    assert.equal(el.namespaceURI, 'http://www.w3.org/2000/svg', `${file}: wrong namespace`)
    const box = el.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number)
    assert(box?.length === 4 && box.every(Number.isFinite) && box[2] > 0 && box[3] > 0, `${file}: invalid viewBox`)
    for (const key of ['width', 'height']) assert(Number(el.getAttribute(key)) > 0, `${file}: invalid ${key}`)
    const ids = new Set()
    for (const node of [el, ...el.querySelectorAll('*')]) {
      assert(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'defs', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'stop', 'title', 'desc'].includes(node.localName), `${file}: unsupported element ${node.localName}`)
      for (const attr of node.attributes) {
        assert(!/^on/i.test(attr.name), `${file}: event handler forbidden`)
        assert(!/javascript:|data:|@import|expression\(/i.test(attr.value), `${file}: executable/external value`)
        if (/href$/i.test(attr.name)) assert(/^#[\w-]+$/.test(attr.value), `${file}: external reference`)
        for (const ref of attr.value.matchAll(/url\(\s*["']?([^\s)"']+)/gi)) assert(/^#[\w-]+$/.test(ref[1]), `${file}: external CSS URL`)
      }
      const id = node.getAttribute('id')
      if (id) { assert(!ids.has(id), `${file}: duplicate local ID`); ids.add(id) }
    }
    for (const ref of svg.matchAll(/url\(#([^\s)]+)\)/g)) assert(ids.has(ref[1]), `${file}: broken local reference`)
    return { width: Number(el.getAttribute('width')), height: Number(el.getAttribute('height')), viewBox: box }
  } finally { dom.window.close() }
}

const safe = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><path d="M1 1h8v8H1z"/></svg>'
for (const payload of ['<script>alert(1)</script>', '<image href="https://example.invalid/a.png"/>', '<path onclick="x()"/>', '<foreignObject/>', '<path fill="url(https://example.invalid/a)"/>']) {
  assert.throws(() => inspect(safe.replace('</svg>', payload + '</svg>'), 'hostile-probe'))
}
assert.throws(() => inspect('<!DOCTYPE svg [<!ENTITY x "abc">]>' + safe, 'entity-probe'))

const hashes = new Map(), checked = []
for (const item of inventory.assets.filter(item => item.path?.endsWith('.svg') && ['CREATE', 'REUSE'].includes(item.status))) {
  const full = resolve(root, item.path)
  assert(!relative(root, full).startsWith('..'), 'Asset escapes repository')
  const svg = readFileSync(full, 'utf8')
  assert(svg.length > 0 && !/figma\.com\/api\/mcp\/asset/.test(svg), `${item.path}: empty/temporary asset`)
  const dimensions = inspect(svg, item.path)
  const hash = createHash('sha256').update(svg).digest('hex')
  assert(!hashes.has(hash), `Duplicate file: ${item.path} and ${hashes.get(hash)}`)
  hashes.set(hash, item.path)
  assert(item.figmaNode && item.consumers?.length, `${item.path}: missing source/consumer`)
  checked.push({ file: item.path, ...dimensions })
}
const component = readFileSync(resolve(root, 'apps/web/src/assets/AssetIcon.tsx'), 'utf8')
for (const match of component.matchAll(/from '(\.\/[^']+\.svg)'/g)) assert(existsSync(resolve(root, 'apps/web/src/assets', match[1])), `Missing import ${match[1]}`)
for (const file of ['apps/web/src/assets/BrandLogo.tsx', 'apps/web/src/assets/asset-icons.css']) assert(existsSync(resolve(root, file)), `Missing ${file}`)
assert(!component.includes('https://'), 'Runtime icons must be local')
const { createServer } = await import(pathToFileURL(requireWeb.resolve('vite')).href)
const React = requireWeb('react')
const { renderToStaticMarkup } = requireWeb('react-dom/server')
const vite = await createServer({ root: resolve(root, 'apps/web'), server: { middlewareMode: true, hmr: false }, appType: 'custom' })
let renderedIcons = 0
try {
  const { AssetIcon } = await vite.ssrLoadModule('/src/assets/AssetIcon.tsx')
  const { BrandLogo } = await vite.ssrLoadModule('/src/assets/BrandLogo.tsx')
  for (const item of inventory.assets.filter(item => ['navigation', 'actions'].includes(item.category) && item.path)) {
    for (const size of [16, 20, 24]) {
      const html = renderToStaticMarkup(React.createElement(AssetIcon, { name: item.id.split('/')[1], size }))
      const dom = new JSDOM(html)
      const span = dom.window.document.querySelector('span')
      assert.equal(span.getAttribute('aria-hidden'), 'true')
      assert.equal(span.style.width, `${size}px`)
      assert.equal(span.style.height, `${size}px`)
      assert(/mask-image:url\([^)]+(?:\.svg|svg\+xml)/.test(span.getAttribute('style')), 'SVG import must resolve through Vite')
      assert(!span.hasAttribute('role') && !span.hasAttribute('aria-label'), 'Decorative icon must not duplicate the label')
      dom.window.close(); renderedIcons++
    }
  }
  const meaningful = renderToStaticMarkup(React.createElement(AssetIcon, { name: 'notifications', label: 'Thông báo' }))
  assert(meaningful.includes('role="img"') && meaningful.includes('aria-label="Thông báo"') && !meaningful.includes('aria-hidden'), 'Meaningful icon needs an accessible name')
  const compact = renderToStaticMarkup(React.createElement(BrandLogo, { variant: 'compact' }))
  const symbol = renderToStaticMarkup(React.createElement(BrandLogo, { variant: 'symbol' }))
  assert.equal(compact, symbol, 'Compact candidate must reuse the symbol')
  assert(symbol.includes('alt="EduCore"') && symbol.includes('width="32"'))
  assert(renderToStaticMarkup(React.createElement(BrandLogo)).includes('width="108"'))
} finally { await vite.close() }
console.log(JSON.stringify({ svgFiles: checked.length, hostileSvgProbesRejected: 6, renderedIcons, accessibility: 'PASS', brandAliases: 'PASS', imports: 'PASS', duplicates: 0, checks: 'PASS', dimensions: checked }, null, 2))
