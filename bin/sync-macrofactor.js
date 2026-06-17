#!/usr/bin/env node
// Fetches newly-emailed MacroFactor .xlsx exports from Gmail (read-only, over
// IMAP) and drops any new ones into the data/ folder, where the dashboard's
// fitness pane auto-reads the newest. Designed to be run by cron every 5 min.
//
// Read-only on Gmail: it never marks, moves, or deletes mail. Idempotent: an
// attachment is skipped if a file of the same name already exists in data/.

import dotenv from 'dotenv'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { ImapFlow } from 'imapflow'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// Load .env from the project root regardless of the cron job's cwd.
dotenv.config({ path: path.join(ROOT, '.env') })

const {
  GMAIL_USER,
  GMAIL_APP_PASSWORD,
  GMAIL_MAILBOX = 'INBOX',
  GMAIL_ATTACHMENT_PATTERN = '^MacroFactor.*\\.xlsx$',
  GMAIL_LOOKBACK_DAYS = '30',
} = process.env

const dirCfg = process.env.MACROFACTOR_DIR || './data'
const DATA_DIR = path.isAbsolute(dirCfg) ? dirCfg : path.resolve(ROOT, dirCfg)
const PATTERN = new RegExp(GMAIL_ATTACHMENT_PATTERN, 'i')

const log = (...a) => console.log(new Date().toISOString(), ...a)

// Walk a bodyStructure tree and collect leaf nodes that carry a filename.
function collectAttachments(node, out = []) {
  if (!node || typeof node !== 'object') return out
  const filename = node.dispositionParameters?.filename || node.parameters?.name
  if (filename && node.part) out.push({ part: node.part, filename })
  if (Array.isArray(node.childNodes)) {
    for (const child of node.childNodes) collectAttachments(child, out)
  }
  return out
}

async function main() {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    log('ERROR: GMAIL_USER and GMAIL_APP_PASSWORD must be set in .env')
    process.exit(1)
  }

  await fsp.mkdir(DATA_DIR, { recursive: true })

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    logger: false, // keep cron logs clean
  })

  await client.connect()
  let saved = 0
  try {
    // Open read-only so we never alter the mailbox (flags, etc.).
    await client.mailboxOpen(GMAIL_MAILBOX, { readOnly: true })

    const since = new Date(Date.now() - Number(GMAIL_LOOKBACK_DAYS) * 86400000)
    const uids = await client.search({ since }, { uid: true })
    if (!uids || uids.length === 0) {
      log('no matching messages in the lookback window')
      return
    }

    // Phase 1: scan message structures and collect matching attachments.
    // IMPORTANT: don't issue any other IMAP command (e.g. download) while the
    // fetch iterator is open — imapflow serializes commands, so doing so
    // deadlocks. Collect everything first, then download after the loop ends.
    const targets = []
    for await (const msg of client.fetch(uids, { uid: true, bodyStructure: true }, { uid: true })) {
      for (const att of collectAttachments(msg.bodyStructure)) {
        if (PATTERN.test(att.filename)) {
          targets.push({ uid: msg.uid, part: att.part, filename: att.filename })
        }
      }
    }

    // Phase 2: download the new ones (fetch iterator is now closed).
    for (const t of targets) {
      const safeName = path.basename(t.filename) // guard against path traversal
      const dest = path.join(DATA_DIR, safeName)
      if (fs.existsSync(dest)) continue // already have it — idempotent

      const { content } = await client.download(t.uid, t.part, { uid: true })
      const tmp = `${dest}.part` // not *.xlsx, so the reader ignores it mid-write
      await pipeline(content, fs.createWriteStream(tmp))
      await fsp.rename(tmp, dest)
      saved++
      log(`saved ${safeName}`)
    }
  } finally {
    await client.logout().catch(() => {})
  }

  log(saved > 0 ? `done — saved ${saved} new export(s)` : 'done — no new exports')
}

main().catch((err) => {
  log('ERROR:', err.message || err)
  process.exit(1)
})
