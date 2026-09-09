# TODO / Roadmap
## 1. "Nuke all" button
Add a one-click button that closes every duplicate tab across all groups
without needing to select anything.
- Placement: both in the popup (for the fastest possible flow: click icon →
  nuke) and on the review page toolbar next to "Select all".
- Behavior: same rule as group closing — keep the oldest tab in each group,
  close the rest.
- Style: this is a destructive bulk action, so it should look different from
  the normal green primary button (e.g. red/danger styling) and announce the
  result via the existing `role="status"` summary.
- Implementation notes: the logic already exists in `duplicates.js` —
  `findDuplicateGroups()` plus the close handler's "slice(1) and
  `chrome.tabs.remove`" pattern. The popup version needs that logic duplicated
  or moved to a shared module.

## 2. Internationalization (i18n)
Translate the extension using Chrome's built-in i18n system so the store
listing and UI can ship in multiple languages.
- Chrome APIs: create a `_locales/<lang>/messages.json` per language and read
  strings with `chrome.i18n.getMessage()`. The manifest `name`/`description`
  become `__MSG_extName__`-style tokens, with `default_locale` set in
  `manifest.json`. Chrome picks the locale automatically from the browser UI
  language — no settings UI needed.
- Strings to extract: everything currently hardcoded in `popup.js`,
  `duplicates.js`, and the two HTML files — button labels, the summary text,
  the "Will stay open" / "Will close if selected" statuses, empty state, and
  all `aria-label`s (screen-reader strings must be translated too).
- Pluralization: the summary builds plurals by hand (`${n === 1 ? "" : "s"}`),
  which doesn't survive translation. Use `getMessage` placeholders and either
  separate singular/plural message keys or `Intl.PluralRules` to pick the key.
- UI thoughts: German/French strings run ~30% longer than English, so check
  the popup width and the toolbar buttons don't wrap or truncate awkwardly;
  the title-tooltip pattern already handles long text in the group list. For
  RTL languages (ar, he), rely on logical CSS properties
  (`margin-inline-start` instead of `margin-left`) and test with `dir="rtl"`.
- Start small: English + one test language (e.g. German for length, Arabic
  for RTL) is enough to validate the plumbing before inviting translations.

## 3. Register as a Chrome Web Store Developer
https://chrome.google.com/webstore/devconsole/register
