/**
 * Screenshot harness for the ATTACHMENT THUMBNAIL + RESIZE BADGE in the chat
 * composer.
 *
 * Reproduces the reported defect against the REAL built SPA (website/dist),
 * gateway-free: pasting phone screenshots (portrait, ~0.46 aspect) stages chips
 * whose width follows the aspect ratio, so each chip is ~30px wide — narrower
 * than the localized "resized" pill, which then wraps one glyph per line and
 * covers the thumbnail it annotates.
 *
 * Pastes three portrait screenshots plus one landscape one, all above the
 * 1568px long-edge model limit so the real client-side resize path runs and
 * populates the badge. Shoots the composer at a 390px phone viewport and at
 * 1280px desktop.
 *
 * ASSERTS as well as photographs: exits non-zero unless four chips render and
 * every one of them carries a resize badge.
 *
 * Usage: node scripts/capture-attachment-thumb-badge.mjs [outDir]
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { serveDist } from './lib/serve-dist.mjs'
import { logPageProblems, stubDashboardApi, json } from './lib/stub-dashboard-api.mjs'

const OUT = process.argv[2] || '../temp-screenshots/attachment-thumb-badge'
const SLOT = 'chat-thumbs'

mkdirSync(OUT, { recursive: true })

/** A mock app screenshot at an exact pixel size: dark status bar, light content
 *  rows. Rendered by the browser we already launched and captured at
 *  deviceScaleFactor 1, so the bytes are a real PNG at exactly w x h with no
 *  encoder of our own. The aspect ratio is the whole point of the fixture. */
async function mockShot(browser, w, h) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  await page.setContent(`<!doctype html><style>
    html,body{margin:0;height:100%;background:#fafafc}
    .bar{height:5%;background:#1c2638}
    .row{height:7.5%;margin:3.5% 6% 0;background:#e2e6ee}
  </style><div class="bar"></div>${'<div class="row"></div>'.repeat(6)}`)
  const buf = await page.screenshot()
  await page.close()
  return buf
}

const UPLOAD_DIR = '/home/user/.kiro/crew/uploads'
const PATHS = [
  `${UPLOAD_DIR}/phone-1.png`,
  `${UPLOAD_DIR}/phone-2.png`,
  `${UPLOAD_DIR}/phone-3.png`,
  `${UPLOAD_DIR}/desktop-1.png`,
]

const slots = [{
  key: SLOT,
  title: 'Attachment preview demo',
  running: false,
  last_message: 'Send the screenshots over and I will take a look.',
  messages: 2,
  agent: 'kirocrew',
  memory_mode: 'persistent',
  project: '',
  folder_id: '',
  modified: Math.floor(Date.now() / 1000),
  source_links: [],
  source_links_total: 0,
}]

const detail = {
  running: false,
  has_more: false,
  total: 2,
  queue: [],
  project: '',
  messages: [
    { role: 'user', ts: Date.now() / 1000 - 90, content: 'I have a few screenshots of the layout problem.' },
    { role: 'assistant', ts: Date.now() / 1000 - 60, content: 'Send the screenshots over and I will take a look.' },
  ],
}

/** Paste N image Files on the composer textarea in one native ClipboardEvent —
 *  the shape a real multi-screenshot clipboard produces. The bytes are real
 *  PNGs so the client-side resize path decodes and downscales them for real. */
async function pasteImages(page, files) {
  await page.evaluate(async payload => {
    const ta = document.querySelector('textarea[data-composer-typo]')
    if (!ta) throw new Error('composer textarea not found')
    ta.focus()
    const dt = new DataTransfer()
    for (const { name, b64 } of payload) {
      const bin = atob(b64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      dt.items.add(new File([bytes], name, { type: 'image/png' }))
    }
    ta.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }))
  }, files)
}

async function shoot(page, label, width) {
  await page.setViewportSize({ width, height: 900 })
  await page.waitForTimeout(400)
  const strip = page.locator('[data-image-scope]').first()
  const lang = process.env.THUMB_LANG || 'en'
  await strip.screenshot({ path: `${OUT}/${label}-${lang}-${width}.png` })
  const metrics = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('[data-image-scope] img')]
    return imgs.map(i => {
      const chip = i.closest('div')
      // Locale-independent: the badge is the chip's only focusable span, which
      // holds in both the pre-fix (text pill) and post-fix (icon) shapes. In the
      // post-fix shape that span is a transparent hit box wrapping the painted
      // mark, so measure both: coverage is what the user SEES over the
      // thumbnail, the hit box is what a thumb has to land on.
      const hit = chip?.querySelector('span[tabindex="0"]')
      const mark = hit?.querySelector('span') || hit
      const ir = i.getBoundingClientRect()
      const hr = hit?.getBoundingClientRect()
      const mr = mark?.getBoundingClientRect()
      return {
        thumbW: Math.round(ir.width),
        thumbH: Math.round(ir.height),
        markW: mr ? Math.round(mr.width) : null,
        markH: mr ? Math.round(mr.height) : null,
        hitW: hr ? Math.round(hr.width) : null,
        hitH: hr ? Math.round(hr.height) : null,
        coverPct: mr ? Math.round((100 * mr.width * mr.height) / (ir.width * ir.height)) : null,
      }
    })
  })
  console.log(`  ${label} @${width}px:`, JSON.stringify(metrics))
  return metrics
}

async function main() {
  const { srv, base } = await serveDist()
  const browser = await chromium.launch()
  // The defect's SHAPE is script-dependent: an unbreakable Latin word overflows
  // the chip sideways onto its neighbour, while CJK breaks per character and
  // instead stacks down the chip, covering the thumbnail. Shoot whichever the
  // caller asked for so both are on record. The stubbed /api/theme/boot carries
  // no explicit language, so the SPA resolves `auto` — driven by the context
  // locale, not by the localStorage fast-path alone.
  const lang = process.env.THUMB_LANG || 'en'
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
    locale: lang,
  })
  const page = await context.newPage()
  logPageProblems(page)

  const PORTRAIT = await mockShot(browser, 1170, 2532) // phone screenshot, aspect 0.46
  const LANDSCAPE = await mockShot(browser, 1920, 1080) // desktop screenshot, aspect 1.78

  await page.addInitScript(l => localStorage.setItem('mc-lang', l), lang)

  await stubDashboardApi(page, {
    slots,
    extra: async (path, route) => {
      if (path === '/api/upload/file') { await json(route, { paths: PATHS }); return true }
      if (path === '/api/file-raw') {
        const url = route.request().url()
        const portrait = !decodeURIComponent(url).includes('desktop-')
        await route.fulfill({ status: 200, contentType: 'image/png', body: portrait ? PORTRAIT : LANDSCAPE })
        return true
      }
      if (path.startsWith('/api/chat/slot/')) { await json(route, detail); return true }
      return false
    },
  })

  await page.goto(`${base}/chat/${SLOT}`)
  await page.waitForSelector('textarea[data-composer-typo]')
  await page.waitForTimeout(500)

  await pasteImages(page, [
    { name: 'phone-1.png', b64: PORTRAIT.toString('base64') },
    { name: 'phone-2.png', b64: PORTRAIT.toString('base64') },
    { name: 'phone-3.png', b64: PORTRAIT.toString('base64') },
    { name: 'desktop-1.png', b64: LANDSCAPE.toString('base64') },
  ])
  await page.waitForSelector('img[alt*="phone-1.png"]', { timeout: 15000 })
  // The badge only renders once the resize path has reported, which lands in a
  // second state update after the chips.
  await page.waitForSelector('[data-image-scope] span[tabindex="0"]', { timeout: 15000 })
  await page.waitForTimeout(400)

  const label = process.env.THUMB_LABEL || 'state'
  const m390 = await shoot(page, label, 390)
  const m1280 = await shoot(page, label, 1280)

  if (m390.length !== 4) throw new Error(`expected 4 chips, saw ${m390.length}`)
  if (m390.some(c => c.markW === null)) throw new Error('every staged chip must carry a resize badge')
  if (m1280.length !== 4) throw new Error(`expected 4 chips at 1280px, saw ${m1280.length}`)
  console.log(`${label} OK: 4 chips staged, all badged`)

  await browser.close()
  srv.close()
}

main().catch(err => { console.error(err); process.exit(1) })
