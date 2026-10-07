'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
    t, has, resolveLocale, normalizeLocale, getDictionary, getFlatKeys,
    getMissingKeys, isRTL, htmlDir, SUPPORTED_LOCALES, NATIVE_NAMES,
    DISCORD_LOCALIZATION_TARGETS, DEFAULT_LOCALE
} = require('..');

test('t() translates and interpolates', () => {
    assert.strictEqual(t('common.not_set', 'en'), 'Not set');
    assert.strictEqual(t('common.not_set', 'id'), 'Belum diatur');
    assert.strictEqual(t('common.not_set', 'es'), 'Sin configurar');
    assert.strictEqual(t('common.not_set', 'zh'), '未设置');
    assert.strictEqual(t('common.not_set', 'ar'), 'غير مُعد');
    assert.strictEqual(t('common.not_set', 'de'), 'Nicht gesetzt');
});

test('t() interpolates {placeholders}', () => {
    const out = t('bot_commands.set-language.replies.set_fixed', 'id', { language: 'Bahasa Indonesia' });
    assert.ok(out.includes('Bahasa Indonesia'), 'placeholder replaced');
    assert.ok(!out.includes('{language}'), 'placeholder token gone');
});

test('t() falls back to English for any locale (never throws)', () => {
    // the missing-key path returns the key itself
    assert.strictEqual(t('totally.missing.key', 'id'), 'totally.missing.key');
    assert.ok(getMissingKeys().includes('totally.missing.key'));
});

test('t() count-based plurals', () => {
    assert.strictEqual(t('common.days', 'de', { count: 1 }), '1 Tag');
    assert.strictEqual(t('common.days', 'de', { count: 3 }), '3 Tage');
    // Arabic "one" naturally omits the digit
    assert.strictEqual(t('common.minutes', 'ar', { count: 1 }), 'دقيقة واحدة');
    assert.strictEqual(t('common.seconds', 'en', { count: 5 }), '5 seconds');
});

test('resolveLocale() maps Discord client locales', () => {
    assert.strictEqual(resolveLocale('id'), 'id');
    assert.strictEqual(resolveLocale('es-ES'), 'es');
    assert.strictEqual(resolveLocale('es-419'), 'es');
    assert.strictEqual(resolveLocale('zh-CN'), 'zh');
    assert.strictEqual(resolveLocale('zh-TW'), 'zh');
    assert.strictEqual(resolveLocale('de'), 'de');
    assert.strictEqual(resolveLocale('en-US'), 'en');
    assert.strictEqual(resolveLocale('en-GB'), 'en');
    // unsupported Discord locales fall back to en
    assert.strictEqual(resolveLocale('ja'), 'en');
    assert.strictEqual(resolveLocale('ru'), 'en');
    assert.strictEqual(resolveLocale(null), 'en');
    assert.strictEqual(resolveLocale(undefined), 'en');
});

test('normalizeLocale() coerces anything', () => {
    assert.strictEqual(normalizeLocale('ID'), 'id');
    assert.strictEqual(normalizeLocale('zh-CN'), 'zh');
    assert.strictEqual(normalizeLocale('auto'), 'en');
    assert.strictEqual(normalizeLocale('gibberish'), 'en');
    assert.strictEqual(normalizeLocale(null), 'en');
});

test('all six locales have identical flat key sets (parity)', () => {
    const base = getFlatKeys('en');
    assert.ok(base.length > 300, 'dictionary is substantial');
    // v1.16.0: the `store` namespace (Thor Market webstore) is en+id only —
    // other locales omit it and fall back to English at runtime.
    const required = (key) => !key.startsWith('store.');
    const baseRequired = base.filter(required);
    for (const lang of SUPPORTED_LOCALES) {
        if (lang === 'en' || lang === 'id') {
            assert.deepStrictEqual(getFlatKeys(lang), base, `${lang} key parity`);
        } else {
            assert.deepStrictEqual(
                getFlatKeys(lang).filter(required),
                baseRequired,
                `${lang} key parity (store namespace optional)`
            );
        }
    }
});

test('store namespace ships in en + id and falls back to en elsewhere', () => {
    for (const key of ['store.nav.home', 'store.brand.buy_now', 'store.checkout.pay_now']) {
        assert.ok(has(key, 'en'), `${key} exists in en`);
        assert.ok(has(key, 'id'), `${key} exists in id`);
        // hard-en fallback serves non-store locales without crashing
        assert.strictEqual(t(key, 'es'), t(key, 'en'), `${key} falls back to en`);
    }
    assert.ok(t('store.cart.title', 'id', { count: 3 }).includes('3'), 'placeholders interpolate');
});

test('every command description exists in every locale', () => {
    // spot-check the registry extraction made it into all dictionaries
    const probe = ['bot_commands.help.description', 'bot_commands.set-key.description',
                   'bot_commands.giveaway.options.create.prize', 'bot_commands.rank.description'];
    for (const key of probe) {
        for (const lang of SUPPORTED_LOCALES) {
            assert.ok(has(key, lang), `${key} exists in ${lang}`);
            assert.ok(!t(key, lang).includes(key), `${key} resolved in ${lang}`);
        }
    }
});

test('Arabic is RTL, everything else LTR', () => {
    assert.strictEqual(isRTL('ar'), true);
    assert.strictEqual(htmlDir('ar'), 'rtl');
    assert.strictEqual(htmlDir('id'), 'ltr');
    assert.strictEqual(htmlDir('en'), 'ltr');
    assert.strictEqual(htmlDir('zh-CN'), 'ltr');
});

test('DISCORD_LOCALIZATION_TARGETS excludes Arabic (unsupported by Discord)', () => {
    const targets = DISCORD_LOCALIZATION_TARGETS.map(([, discord]) => discord);
    assert.ok(!targets.includes('ar'), 'ar must NOT be sent to Discord localizations');
    assert.ok(targets.includes('id'));
    assert.ok(targets.includes('es-ES'));
    assert.ok(targets.includes('zh-CN'));
    assert.ok(targets.includes('de'));
});

test('getDictionary returns nested objects with native names', () => {
    const id = getDictionary('id');
    assert.strictEqual(typeof id.common.not_set, 'string');
    assert.strictEqual(NATIVE_NAMES.id, 'Bahasa Indonesia');
    assert.strictEqual(NATIVE_NAMES.ar, 'العربية');
    // fallback dictionary for an unknown locale
    assert.strictEqual(getDictionary('xx').common.not_set, 'Not set');
});

test('O(1) contract: flat maps are prebuilt and stable', () => {
    // calling t() many times must not rebuild or mutate the maps
    const before = getFlatKeys('en').length;
    for (let i = 0; i < 1000; i++) t('common.yes', 'de');
    assert.strictEqual(getFlatKeys('en').length, before);
    assert.strictEqual(t('common.yes', 'de'), 'Ja');
});
