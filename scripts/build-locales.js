#!/usr/bin/env node
'use strict';

/**
 * Build locales/{id,es,zh,ar,de}.json from the flat translation maps in
 * /home/z/my-project/scripts/i18n_lang_*.js, validating against locales/en.json:
 *
 *   1. Key parity      — every locale must define exactly the same flat key
 *                        set as en (missing AND extra keys are hard errors).
 *   2. Placeholders    — a translation may only use placeholders that exist
 *                        in the English source (typo'd {usr} breaks
 *                        interpolation silently). OMITTING one is allowed —
 *                        some languages drop {count} in natural plurals
 *                        (Arabic "ثانية واحدة" = "one second", no digit).
 *   3. Non-empty       — every value is a non-empty string (or a plural
 *                        object whose every leaf is a non-empty string).
 *
 * NOTE on nesting: en.json stores dotted option names ('create.channel') as
 * literal keys; the generated locales nest them (options.create.channel).
 * Both shapes flatten to the SAME flat key — the runtime only ever reads
 * flat keys, so they are functionally identical.
 */
const fs = require('fs');
const path = require('path');

const ROOT = '/home/z/my-project/audit/CHRONOS-i18n';
const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'locales/en.json'), 'utf8'));

function flatten(obj, prefix, out) {
    for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v !== null && typeof v === 'object') flatten(v, key, out);
        else out[key] = v;
    }
}

function placeholders(s) {
    return [...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
}

function nest(flat) {
    const root = {};
    for (const [k, v] of Object.entries(flat)) {
        const parts = k.split('.');
        let cur = root;
        let collided = false;
        for (let i = 0; i < parts.length - 1; i++) {
            const p = parts[i];
            if (cur[p] === undefined || cur[p] === null) cur[p] = {};
            if (typeof cur[p] !== 'object') {
                // e.g. options.create is a subcommand DESCRIPTION (string) while
                // options.create.channel is a sub-option key — an object cannot
                // shadow the string. Keep the string; park this key at root.
                collided = true;
                break;
            }
            cur = cur[p];
        }
        if (collided) {
            root[k] = v; // literal dotted key — flattens back to exactly k
            continue;
        }
        const last = parts[parts.length - 1];
        if (typeof cur[last] === 'object') {
            // mirror case: the leaf name is already an object (subcommand group
            // whose description was inserted after its sub-options)
            root[k] = v;
        } else {
            cur[last] = v;
        }
    }
    return root;
}

// flat English source of truth
const enFlat = {};
flatten(en, '', enFlat);
const enKeys = Object.keys(enFlat).sort();

const LANGS = ['id', 'es', 'zh', 'ar', 'de'];
let failed = false;

for (const lang of LANGS) {
    const map = require(`/home/z/my-project/scripts/i18n_lang_${lang}.js`);

    // flatten (plural objects become .one / .other keys)
    const flat = {};
    flatten(map, '', flat);

    const langKeys = Object.keys(flat).sort();
    const missing = enKeys.filter(k => !(k in flat));
    const extra = langKeys.filter(k => !(k in enFlat));

    const problems = [];
    for (const k of missing) problems.push(`  MISSING  ${k}`);
    for (const k of extra) problems.push(`  EXTRA    ${k}`);

    // placeholder + non-empty validation on shared keys
    for (const k of enKeys) {
        if (!(k in flat)) continue;
        const v = flat[k];
        if (typeof v !== 'string' || v.trim() === '') {
            problems.push(`  EMPTY    ${k}`);
            continue;
        }
        const enPh = placeholders(enFlat[k]);
        const langPh = placeholders(v);
        const rogue = langPh.filter(p => !enPh.includes(p));
        if (rogue.length) {
            problems.push(`  PLACEHOLDER ${k}: en={${enPh.join(',')}} ${lang} has unknown {${rogue.join(',')}}`);
        }
    }

    if (problems.length) {
        failed = true;
        console.error(`✗ ${lang} (${problems.length} problems):`);
        for (const p of problems) console.error(p);
        continue;
    }

    fs.writeFileSync(
        path.join(ROOT, 'locales', `${lang}.json`),
        JSON.stringify(nest(flat), null, 2) + '\n'
    );
    console.log(`✓ ${lang}.json — ${langKeys.length} keys, parity + placeholders OK`);
}

if (failed) {
    console.error('\nBUILD FAILED — fix the problems above and re-run.');
    process.exit(1);
}
console.log(`\nAll ${LANGS.length} locales built (en: ${enKeys.length} keys).`);
