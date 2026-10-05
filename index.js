'use strict';

/**
 * @chronos/i18n — shared translation runtime for CHRONOS-bot (Discord, CJS)
 * and CHRONOS-Dashboard (Next.js). One dictionary source for both sides, so
 * the web UI and the bot replies never drift apart.
 *
 * Design goals:
 *  - O(1) lookups: every locale is flattened ONCE into a Map<"a.b.c", string>.
 *    t() = a single Map.get + one interpolation pass. No nested property
 *    walks, no regex-per-lookup, no re-parsing of JSON.
 *  - Hard English fallback: a missing key in the active locale falls back to
 *    en before giving up. A missing key NEVER throws — production bots must
 *    not crash over a translation; the key itself is returned and the miss
 *    is logged once (dev) / queryable via getMissingKeys().
 *  - Zero dependencies, synchronous, lazy per-locale loading. The requires
 *    below are STATIC so webpack/turbopack can statically bundle them for the
 *    dashboard's client components.
 *
 * Locale model:
 *  - 'en' is the source of truth and the fallback for every other locale.
 *  - Discord client locales (interaction.locale) are mapped via
 *    resolveLocale(); users of languages we do not ship fall back to 'en'.
 *  - NOTE: Discord does not offer Arabic as a client language, so 'ar' can
 *    never be auto-detected from a user — it only activates via a per-guild
 *    language override (/set-language on the bot side).
 */

const DEFAULT_LOCALE = 'en';
const SUPPORTED_LOCALES = ['en', 'id', 'es', 'zh', 'ar', 'de'];

/** Native names for UI switchers (how each language calls itself). */
const NATIVE_NAMES = {
    en: 'English',
    id: 'Bahasa Indonesia',
    es: 'Español',
    zh: '中文',
    ar: 'العربية',
    de: 'Deutsch'
};

/** Discord client locale (lower-cased) → CHRONOS locale. */
const DISCORD_TO_CHRONOS = {
    en: 'en', 'en-us': 'en', 'en-gb': 'en',
    id: 'id',
    es: 'es', 'es-es': 'es', 'es-419': 'es',
    zh: 'zh', 'zh-cn': 'zh', 'zh-tw': 'zh',
    de: 'de', 'de-de': 'de', 'de-at': 'de', 'de-ch': 'de'
};

/**
 * CHRONOS locale → valid Discord command-localization targets
 * (description_localizations). 'ar' is EXCLUDED on purpose: Discord's
 * localization API rejects locale keys it does not support and Arabic is not
 * among them (guild-override only). zh-TW and es-419 are free wins that reuse
 * the zh / es dictionaries.
 */
const DISCORD_LOCALIZATION_TARGETS = [
    ['id', 'id'],
    ['es', 'es-ES'],
    ['es', 'es-419'],
    ['zh', 'zh-CN'],
    ['zh', 'zh-TW'],
    ['de', 'de']
];

const RTL_LOCALES = new Set(['ar']);

// --- dictionary loading (static requires → bundler-friendly) -------------

const DICTIONARIES = {
    en: () => require('./locales/en.json'),
    id: () => require('./locales/id.json'),
    es: () => require('./locales/es.json'),
    zh: () => require('./locales/zh.json'),
    ar: () => require('./locales/ar.json'),
    de: () => require('./locales/de.json')
};

// locale → Map(flatKey → string), built once on first use.
const flatMaps = new Map();
// dev diagnostics: keys that missed in every locale, logged once each.
const missingKeys = new Set();

function flattenInto(obj, prefix, out) {
    for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v !== null && typeof v === 'object') flattenInto(v, key, out);
        else if (typeof v === 'string' || typeof v === 'number') out.set(key, String(v));
    }
}

/** Get (and lazily build) the flat key→string Map for a locale. */
function flatMap(locale) {
    const loc = normalizeLocale(locale);
    if (flatMaps.has(loc)) return flatMaps.get(loc);
    const map = new Map();
    if (DICTIONARIES[loc]) {
        try {
            flattenInto(DICTIONARIES[loc](), '', map);
        } catch (_) {
            // unreadable dictionary — degrade to the en fallback below
        }
    }
    flatMaps.set(loc, map);
    return map;
}

// --- public API -----------------------------------------------------------

/** Map a Discord client locale ('zh-CN', 'es-ES', 'id', …) to ours. */
function resolveLocale(discordLocale) {
    if (typeof discordLocale !== 'string' || !discordLocale) return DEFAULT_LOCALE;
    const l = discordLocale.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(DISCORD_TO_CHRONOS, l)) {
        return DISCORD_TO_CHRONOS[l];
    }
    // Unknown variant ('de-AT', a future 'id-ID', …): match the language part.
    const lang = l.split('-')[0];
    return DISCORD_TO_CHRONOS[lang] || DEFAULT_LOCALE;
}

/** Coerce any input ('zh-CN', 'ID', 'auto', garbage, null) to a supported locale. */
function normalizeLocale(locale) {
    if (typeof locale !== 'string' || !locale) return DEFAULT_LOCALE;
    const l = locale.toLowerCase();
    if (l === 'auto') return DEFAULT_LOCALE; // 'auto' resolves per-interaction upstream
    if (SUPPORTED_LOCALES.includes(l)) return l;
    const lang = l.split('-')[0];
    return SUPPORTED_LOCALES.includes(lang) ? lang : DEFAULT_LOCALE;
}

function lookup(key, locale) {
    const loc = normalizeLocale(locale);
    if (loc !== DEFAULT_LOCALE) {
        const v = flatMap(loc).get(key);
        if (v !== undefined) return v;
    }
    return flatMap(DEFAULT_LOCALE).get(key); // hard en fallback (may be undefined)
}

/** {name} placeholder interpolation — one pass, unknown names left intact. */
function interpolate(template, vars) {
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (m, name) =>
        Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : m
    );
}

/**
 * Translate a key.
 *
 *   t('common.access_denied', 'id')
 *   t('bot_commands.set-language.replies.set_fixed', 'de', { language: 'Deutsch' })
 *
 * Plural convention: when vars.count is a number, `${key}.one` (count === 1)
 * or `${key}.other` is tried first, then the bare key:
 *
 *   "warnings": { "one": "{count} warning", "other": "{count} warnings" }
 *   t('warnings', 'en', { count: 3 })  → "3 warnings"
 *
 * Missing everywhere → returns the key itself (never throws), logs once in
 * non-production and records it for getMissingKeys().
 */
function t(key, locale, vars) {
    let value;
    if (vars && typeof vars.count === 'number') {
        const pluralKey = `${key}.${vars.count === 1 ? 'one' : 'other'}`;
        value = lookup(pluralKey, locale);
        if (value === undefined) value = lookup(key, locale);
    } else {
        value = lookup(key, locale);
    }
    if (value === undefined) {
        if (!missingKeys.has(key)) {
            missingKeys.add(key);
            if (process.env.NODE_ENV !== 'production') {
                console.warn(`[i18n] missing key "${key}" (locale "${locale}") — returning the key`);
            }
        }
        return key;
    }
    return interpolate(value, vars);
}

/** Does the key exist (in the locale, or via the en fallback)? */
function has(key, locale) {
    return lookup(key, locale) !== undefined;
}

/** Get the raw nested dictionary object for a locale (falls back to en). */
function getDictionary(locale) {
    const loc = normalizeLocale(locale);
    return DICTIONARIES[loc] ? DICTIONARIES[loc]() : DICTIONARIES[DEFAULT_LOCALE]();
}

/** All flat keys of a locale (parity checks / tooling). */
function getFlatKeys(locale) {
    return [...flatMap(locale).keys()].sort();
}

/** Keys that missed in every locale since boot (dev diagnostics). */
function getMissingKeys() {
    return [...missingKeys].sort();
}

/** Right-to-left? (Arabic) */
function isRTL(locale) {
    return RTL_LOCALES.has(normalizeLocale(locale));
}

/** 'rtl' | 'ltr' — for <html dir>. */
function htmlDir(locale) {
    return isRTL(locale) ? 'rtl' : 'ltr';
}

module.exports = {
    DEFAULT_LOCALE,
    SUPPORTED_LOCALES,
    NATIVE_NAMES,
    DISCORD_LOCALIZATION_TARGETS,
    resolveLocale,
    normalizeLocale,
    t,
    has,
    getDictionary,
    getFlatKeys,
    getMissingKeys,
    isRTL,
    htmlDir
};
