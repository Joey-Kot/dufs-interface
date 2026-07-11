import { readFile, writeFile } from 'node:fs/promises'

const indexPath = new URL('../dist/index.html', import.meta.url)
const distPath = new URL('../dist/', import.meta.url)
const html = await readFile(indexPath, 'utf8')
const stylesheetMatch = html.match(/<link rel="stylesheet" crossorigin href="\.\/([^"]+)">/)
const scriptMatch = html.match(/<script type="module" crossorigin src="\.\/([^"]+)"><\/script>/)

if (!stylesheetMatch?.[1] || !scriptMatch?.[1]) {
  throw new Error('Unable to find Vite CSS and JavaScript entries in dist/index.html')
}

const [css, javascript, favicon] = await Promise.all([
  readFile(new URL(stylesheetMatch[1], distPath), 'utf8'),
  readFile(new URL(scriptMatch[1], distPath), 'utf8'),
  readFile(new URL('favicon.svg', distPath)),
])

const inlineScript = javascript.replaceAll('</script', '<\\/script')
const faviconData = `data:image/svg+xml;base64,${favicon.toString('base64')}`
const output = html
  .replace(stylesheetMatch[0], () => `<style>${css}</style>`)
  .replace(scriptMatch[0], () => `<script type="module">${inlineScript}</script>`)
  .replace(/<link rel="icon"[^>]*>/, `<link rel="icon" type="image/svg+xml" href="${faviconData}" />`)

await writeFile(indexPath, output)
