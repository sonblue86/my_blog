// @ts-check
import { createHash } from 'node:crypto';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Astro's `security.csp` hashes the scripts it bundles, but NOT `<script is:inline>` blocks (theme boot
 * script in <head>, the view/reaction placeholders, /ngau-nhien/). Without their hash in `script-src`
 * the browser blocks them. After the build, this integration hashes every inline script of every page
 * and appends the missing hashes to that page's CSP <meta>.
 *
 * Only executable inline scripts are hashed: `src` scripts are covered by 'self'/host sources and
 * data blocks (application/json, ld+json) never execute.
 */
const META_RE = /(<meta http-equiv="content-security-policy" content=")([^"]*)(")/i;
const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const DATA_TYPE_RE = /\btype=["']?(?:application\/(?:ld\+)?json|text\/template|importmap)/i;

/** @param {string} html */
export function addInlineScriptHashes(html) {
  const meta = META_RE.exec(html);
  if (!meta) return { html, added: 0 };
  const policy = meta[2] ?? '';
  /** @type {Set<string>} */
  const missing = new Set();
  for (const [, attrs = '', body = ''] of html.matchAll(SCRIPT_RE)) {
    if (/\bsrc\s*=/.test(attrs) || DATA_TYPE_RE.test(attrs) || !body) continue;
    const hash = `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`;
    if (!policy.includes(hash)) missing.add(hash);
  }
  if (!missing.size) return { html, added: 0 };
  if (!/(^|;)\s*script-src\s/.test(policy)) throw new Error('csp-inline: the CSP <meta> has no script-src directive');
  const next = policy.replace(/((?:^|;)\s*script-src\s[^;]*)/, `$1 ${[...missing].join(' ')}`);
  return { html: html.replace(META_RE, (_, a, __, c) => a + next + c), added: missing.size };
}

/** @param {string} dir @returns {AsyncGenerator<string>} */
async function* htmlFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(path);
    else if (entry.name.endsWith('.html')) yield path;
  }
}

/** @returns {import('astro').AstroIntegration} */
export default function cspInline() {
  return {
    name: 'csp-inline',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        let pages = 0;
        let hashes = 0;
        for await (const file of htmlFiles(fileURLToPath(dir))) {
          const { html, added } = addInlineScriptHashes(await readFile(file, 'utf8'));
          if (!added) continue;
          await writeFile(file, html);
          pages++;
          hashes += added;
        }
        logger.info(`added ${hashes} inline-script hash(es) to the CSP of ${pages} page(s)`);
      },
    },
  };
}
