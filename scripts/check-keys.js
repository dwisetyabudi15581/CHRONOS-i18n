#!/usr/bin/env node
'use strict';

/**
 * CI key-parity check for the BUILT locale files (no build-step dependency).
 * Verifies that all six locales/*.json carry exactly the same flat key set,
 * every value is a non-empty string, and no translation uses a placeholder
 * that the English source does not have. Exits 1 on any problem.
 *
 * EXCEPTION (v1.16.0): the `store` namespace (Thor Market webstore UI) is
 * only required in `en` + `id` — other locales fall back to English at
 * runtime via the hard-en fallback, and translations can be added later
 * without any tooling change. Non-store keys keep full 6-locale parity.
 */
const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..', 'locales');
const LANGS = ['en', 'id', 'es', 'zh', 'ar', 'de'];
// Namespaces that a locale may OMIT (checked only for en + id).
const OPTIONAL_OUTSIDE = ['store'];
const OPTIONAL_LOCALES = ['en', 'id'];

function flatten(obj, prefix, out) {
    for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v !== null && typeof v === 'object') flatten(v, key, out);
        else out[key] = String(v);
    }
}

function placeholders(s) {
    return [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
}

const flat = {};
for (const lang of LANGS) {
    const file = path.join(LOCALES_DIR, `${lang}.json`);
    if (!fs.existsSync(file)) {
        console.error(`✗ ${lang}.json is missing`);
        process.exit(1);
    }
    flat[lang] = {};
    flatten(JSON.parse(fs.readFileSync(file, 'utf8')), '', flat[lang]);
}

const base = Object.keys(flat.en).sort();
let failed = false;

for (const lang of LANGS) {
    const keys = Object.keys(flat[lang]).sort();
    // Keys this locale is allowed to omit (e.g. `store.*` outside en+id).
    const isOptional = (k) =>
        !OPTIONAL_LOCALES.includes(lang) && OPTIONAL_OUTSIDE.some((ns) => k.startsWith(`${ns}.`));
    const missing = base.filter(k => !(k in flat[lang]) && !isOptional(k));
    const extra = keys.filter(k => !(k in flat.en));
    const problems = [];
    for (const k of missing) problems.push(`  MISSING  ${k}`);
    for (const k of extra) problems.push(`  EXTRA    ${k}`);
    for (const [k, v] of Object.entries(flat[lang])) {
        if (!v || !v.trim()) problems.push(`  EMPTY    ${k}`);
        const rogue = placeholders(v).filter(p => !placeholders(flat.en[k] ?? '').includes(p));
        if (rogue.length) problems.push(`  PLACEHOLDER ${k}: unknown {${rogue.join(',')}}`);
    }
    if (problems.length) {
        failed = true;
        console.error(`✗ ${lang} (${problems.length} problems):`);
        for (const p of problems) console.error(p);
    } else {
        const omitted = base.filter(k => isOptional(k) && !(k in flat[lang])).length;
        console.log(`✓ ${lang} — ${keys.length} keys, parity OK${omitted ? ` (store: ${omitted} keys optional, en fallback)` : ''}`);
    }
}

if (failed) {
    console.error('\nKey parity FAILED.');
    process.exit(1);
}
console.log(`\nAll ${LANGS.length} locales carry the same ${base.length} keys (namespace "store" required in ${OPTIONAL_LOCALES.join(' + ')} only).`);
