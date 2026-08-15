# Changelog

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


