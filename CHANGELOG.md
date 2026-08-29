# Changelog

## [0.8.0] - 2026-08-28

### Added
- Structural list row matching with identity lifecycle hooks

### Changed
- Update clay-data.js vendor path to clayjs/entries



## [0.7.0] - 2026-08-28

### Added
- `apply` takes two optional list hooks. `identifyRows(path, items)` runs before matching and names the existing node each incoming item belongs to, so a caller holding a stable handle on its own rows can tell two byte-identical rows apart. `onRowsApplied(path, nodes)` reports the node each item ended up on once the list has settled, including the empty array when a list settles empty. Both are absent by default, and a supplied node that is not currently in the list is ignored.
- `extract` takes `onRowsRead(path, nodes)`, reporting the node each item was read from, for both list syntaxes (`[selector, shape]` and `"selector[]"`). It lets a caller establish row identity from the read it builds its own UI from, before any `apply` has happened. Pass it only to a top-level `extract`: `apply` re-reads each existing row with a path that restarts at the row, so a nested list would be reported under a truncated path.

### Fixed
- Editing a row no longer replaces it with a clone of the first row. Rows are matched by a two-pass alignment that pairs every row it can, so a list creates a node only when it grows and destroys one only when it shrinks. One-field lists and scalar lists could not survive an edit at all before this.
- A plain edit on a list whose rows carry ids no longer warns about stripped id attributes. The template is cloned only when the list actually grew.
- Applying unchanged text no longer rewrites the text node. Every text rule used to replace its node on every apply, so a caller that re-applies a whole document (the CMS does, on each keystroke) produced a DOM mutation per text rule with nothing changed, and those reached mutation observers, undo and live sync. Scalar lists already compared before writing; this is that comparison everywhere else.
- A list whose item shape is a string rule (`[".r", "."]`) is matched as a string instead of as an object. `Object.keys('.')` is `["0"]`, so two items were compared by their first character and an edit could destroy the wrong row.
- `identifyRows` no longer leaves the rows around a locked one as ambiguous as they were. Uniqueness for the anchor pass is counted over the unlocked rows only, so locking one of two identical rows now lets the other match where it moved to.

### Changed

- **A list now reuses its existing rows whatever the incoming data looks like.** The rule is structural, not similarity-based: a row is rebuilt from the template only when the list grew. Editing a row is the everyday case, but the same holds when you replace a list wholesale with entirely unrelated items. Those items are written into the rows already there, and **anything a row carried that the rules do not describe stays on the page** (an image, nested markup, a listener, widget state). Previously a sufficiently different row scored below the similarity threshold and was rebuilt clean.

  This is the intended behaviour and the reason for the change, but it is a real difference for a caller who was relying on a wholesale replace to produce fresh rows. Such a caller should clear the list first (apply `[]`, then the new items), which removes every node and rebuilds from the template.

  A list rule with no item shape (`['.r']`) is affected the same way: every row now matches, where before none did.



## [0.6.5] - 2026-08-21

### Changed
- Synced package-lock.json to the published dependency versions
- Updated hyper-html-api package contents



## [Unreleased]

### Changed
- License: relicensed to MIT-0 (MIT No Attribution). Same rights, attribution no longer required.

## [0.6.4] - 2026-08-16

### Changed
- Updated ecosystem dependencies to their latest versions



## [0.6.3] - 2026-08-15

### Added
- `hyper-html-api` package to the workspace



## [0.6.2] - 2026-08-14

### Fixed
- Boolean props (`@checked`, `@selected`, `@disabled`, `@readOnly`, `@paused`) now read the string `"false"` as false. `Boolean("false")` is true, so a form-state or attribute round-trip delivering `"false"` checked the box instead of clearing it.



## [0.6.1] - 2026-08-14

### Added
- Initial hyper-html-api implementation.



## [0.5.2] - 2026-08-11

### Added
- Declared `kind`, `status`, and `url` fields in the `hyper` key

### Changed
- Synced ecosystem dependencies to their latest versions



## [0.5.0] - 2026-06-16

### Changed
- Refactor upgrade system with better separation of concerns


