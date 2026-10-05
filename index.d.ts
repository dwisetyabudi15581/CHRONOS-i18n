/**
 * @chronos/i18n — TypeScript declarations (for CHRONOS-Dashboard).
 */

export type ChronosLocale = 'en' | 'id' | 'es' | 'zh' | 'ar' | 'de';

export interface TVars {
    [name: string]: string | number;
    count?: number;
}

export declare const DEFAULT_LOCALE: ChronosLocale;
export declare const SUPPORTED_LOCALES: ChronosLocale[];
export declare const NATIVE_NAMES: Record<ChronosLocale, string>;
export declare const DISCORD_LOCALIZATION_TARGETS: Array<[ChronosLocale, string]>;

/** Map a Discord client locale ('zh-CN', 'es-ES', 'id', …) to ours. */
export declare function resolveLocale(discordLocale: string | null | undefined): ChronosLocale;

/** Coerce any input ('zh-CN', 'ID', 'auto', garbage, null) to a supported locale. */
export declare function normalizeLocale(locale: string | null | undefined): ChronosLocale;

/** Translate a key with {placeholder} interpolation + count-based plurals. */
export declare function t(key: string, locale?: string | null, vars?: TVars): string;

/** Does the key exist (in the locale, or via the en fallback)? */
export declare function has(key: string, locale?: string | null): boolean;

/** Raw nested dictionary for a locale (falls back to en). */
export declare function getDictionary(locale?: string | null): Record<string, unknown>;

/** All flat keys of a locale (parity checks / tooling). */
export declare function getFlatKeys(locale?: string | null): string[];

/** Keys that missed in every locale since boot (dev diagnostics). */
export declare function getMissingKeys(): string[];

/** Right-to-left? (Arabic) */
export declare function isRTL(locale?: string | null): boolean;

/** 'rtl' | 'ltr' — for <html dir>. */
export declare function htmlDir(locale?: string | null): 'rtl' | 'ltr';
