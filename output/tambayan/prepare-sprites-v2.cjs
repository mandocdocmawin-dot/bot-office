// Format/size normalization only; original image artwork and alpha are preserved.
// Usage: node output/tambayan/prepare-sprites-v2.cjs
const fs = require('node:fs/promises')
const path = require('node:path')
const sharp = require('C:/Users/Marwin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp')
const root = path.resolve(__dirname, '../..')
;(async () => {
 const sources = JSON.parse(await fs.readFile(path.join(__dirname, 'sprite-sources-v2.json'), 'utf8'))
 const destination = path.join(root, 'web/public/assets/tambayan/sprites-v2')
 await fs.mkdir(destination, { recursive: true })
 const only = new Set(process.argv.slice(2))
 const manifestPath = path.join(root, 'web/src/tambayan-sprites-v2.json')
 const manifest = only.size ? JSON.parse(await fs.readFile(manifestPath, 'utf8')) : {}
 for (const source of sources) {
  if (only.size && !only.has(source.id)) continue
  const target = path.join(destination, `${source.id}.webp`)
  await sharp(source.source).resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
   .webp({ quality: 94, alphaQuality: 100, effort: 6 }).toFile(target)
  const { data, info } = await sharp(target).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let left = info.width, right = 0, top = info.height, bottom = 0, transparent = 0
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
   const alpha = data[(y * info.width + x) * 4 + 3]
   if (alpha === 0) transparent++
   // Ignore faint glows when measuring the object, while retaining them in the file.
   if (alpha > 96) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y) }
  }
  if (!transparent || right <= left || bottom <= top) throw new Error(`Invalid transparent sprite: ${source.id}`)
  manifest[source.id] = {
   file: `/assets/tambayan/sprites-v2/${source.id}.webp`, width: info.width, height: info.height,
   bounds: { x: left, y: top, w: right - left + 1, h: bottom - top + 1 }
  }
 }
 await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
 console.log(`Prepared ${Object.keys(manifest).length} sprites; transparency and bounds verified.`)
})().catch(error => { console.error(error); process.exitCode = 1 })
