# @chronos/i18n

Shared internationalization runtime + dictionaries for **[CHRONOS-bot](https://github.com/dwisetyabudi15581/CHRONOS-bot)** (Discord) and **[CHRONOS-Dashboard](https://github.com/dwisetyabudi15581/CHRONOS-Dashboard)** (Next.js) — one source of truth so the web UI and the bot replies never drift apart.

**Languages:** English (`en`, default & fallback) · Bahasa Indonesia (`id`) · Español (`es`) · 中文 (`zh`) · العربية (`ar`) · Deutsch (`de`)

## Install (GitHub dependency — no registry needed)

npm 12+ (bundled with Node 26) disables fetching **git-type dependencies by default** (`EALLOWGIT`). Use the explicit `git+https` form (anonymous clone — no SSH keys, no tokens) and allow git deps in your project's `.npmrc`:

```bash
npm install git+https://github.com/dwisetyabudi15581/CHRONOS-i18n.git#v1.1.0
```

```ini
# .npmrc (project root) — required on npm 12+, harmlessly ignored by older npm
allow-git=all
```

In `package.json`:

```json
"@chronos/i18n": "git+https://github.com/dwisetyabudi15581/CHRONOS-i18n.git#v1.1.0"
```

CommonJS (the bot):

```js
const { t, resolveLocale } = require('@chronos/i18n');
```

TypeScript / Next.js (the dashboard):

```ts
import { t, resolveLocale, isRTL, htmlDir } from '@chronos/i18n';
```

## Runtime design

- **O(1) lookups** — every locale is flattened once into a `Map<"a.b.c", string>`; `t()` is a single `Map.get` plus one interpolation pass.
- **Hard English fallback** — a missing key in the active locale falls back to `en` before giving up; a key missing everywhere returns the key itself and never throws (a translation gap can't crash a production bot). Misses are queryable via `getMissingKeys()`.
- **`{placeholder}` interpolation** — `t('bot_commands.set-language.replies.set_fixed', 'de', { language: 'Deutsch' })`.
- **CLDR-lite plurals** — pass `count` and the runtime tries `${key}.one` (count === 1) / `${key}.other` first:

  ```json
  "days": { "one": "{count} day", "other": "{count} days" }
  ```

  Translations may omit a placeholder in natural plurals (Arabic `دقيقة واحدة` = "one minute", no digit) — the build only forbids placeholders the English source doesn't have.

- **Zero dependencies**, synchronous, static per-locale requires (webpack/turbopack-friendly).

## API

| Export | Purpose |
| ------ | ------- |
| `t(key, locale?, vars?)` | Translate `key` with fallback chain `locale → en → key` |
| `resolveLocale(discordLocale)` | Map a Discord client locale (`zh-CN`, `es-ES`, `id`…) to ours |
| `normalizeLocale(anything)` | Coerce `'ID'`, `'zh-CN'`, `'auto'`, garbage, null → a supported locale |
| `has(key, locale?)` | Does the key resolve? |
| `getDictionary(locale)` | Raw nested dictionary (en fallback) |
| `getFlatKeys(locale)` | All flat keys (tooling / parity checks) |
| `getMissingKeys()` | Keys that missed in every locale since boot |
| `isRTL(locale)` / `htmlDir(locale)` | `true` / `'rtl'` for Arabic — for `<html lang dir>` |
| `SUPPORTED_LOCALES` / `DEFAULT_LOCALE` / `NATIVE_NAMES` | Metadata for UI switchers |
| `DISCORD_LOCALIZATION_TARGETS` | `[chronosLocale, discordLocale]` pairs valid for command `description_localizations` |

## Dictionary format (`locales/*.json`)

Four modules — `common` (shared strings), `bot_commands` (per-command descriptions, options, replies), `dashboard` (web UI), and `store` (**Thor Market** webstore UI — nav, catalog, product, cart, checkout, footer). Every locale carries **exactly the same flat key set**, enforced by `npm run check` — with one documented exception: the `store` namespace is shipped in **`en` + `id`** only (205 keys in v1.16.0); es/zh/ar/de omit it and the runtime's hard-en fallback serves English for store surfaces until those translations land.

## Language detection model

1. **Auto (default)** — the bot replies in each user's own Discord app language via `interaction.locale` → `resolveLocale()`.
2. **Guild override** — `/set-language` (bot v4.10.0+) or the dashboard's General Settings stores `general.language` in the guild config; when set, every reply uses that language regardless of the user's Discord language.

**Arabic note:** Discord does not offer Arabic as a client locale — `ar` can never be auto-detected from `interaction.locale`, and it is deliberately excluded from `DISCORD_LOCALIZATION_TARGETS` (Discord's command-localization API rejects locale keys it does not support). Arabic activates via the guild override only.

## Development

```bash
npm test     # unit tests (translations resolve, plurals, locale mapping, parity)
npm run check  # CI: all six locales carry the same key set + placeholder sanity
```

`scripts/check-keys.js` is the CI gate — run it in any workflow that edits `locales/`.
