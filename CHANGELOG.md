# Changelog

All notable changes to TaskMind are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/)

---

## [Unreleased]

### Added
- Nothing yet — Sprint 1 features pending

---

## [0.1.0-pipeline] — 2026-05-18

### Sprint 0: Scaffold & CI Pipeline

This release establishes the complete project foundation. Installing this APK and seeing the Hello TaskMind screen confirms the entire CI pipeline is working.

### Added
- **F-CI-01:** GitHub Actions build pipeline (`ci.yml`, `build-debug.yml`, `build-release.yml`)
- **F-CI-02:** Automated testing in CI — Jest runs with coverage thresholds on every push
- **F-CI-03:** APK artifact publication — debug APK as 30-day artifact on every push; signed release APK on tags
- Expo SDK 53 project scaffold with React Native 0.79 + New Architecture enabled
- TypeScript strict mode — full `strict: true` tsconfig
- Drizzle ORM schema — all 7 tables per SRS Section 5.1; initial migration generated
- Custom notification listener Expo module skeleton — Kotlin stubs for all 5 service/receiver classes
- Full `src/` directory structure per SRS Section 3.2
- Design token system — colors, typography, spacing from UI/UX spec
- Seed keyword vocabulary — 120+ keywords across English/Hindi/Hinglish
- Extraction pipeline — language detector, preprocessor, rule engine, priority assigner, action extractor, confidence aggregator (all pure TypeScript, fully unit-tested)
- Expo Router with placeholder screens for all routes
- Hello TaskMind home screen with build info, version, and commit SHA
- Diagnostics screen scaffold (5-tab placeholder, Sprint 2 wiring)
- i18n: `en.json` and `hi.json` locale files
- One-shot keystore generation workflow (`generate-keystore.yml`)
- `README.md`, `SETUP.md`, PR template, bug report template

### Technical Details
- React Native 0.79.3 + React 19.0.0 + Expo 53.0.9
- New Architecture: `newArchEnabled=true`, Hermes V1
- Android min SDK 28, target SDK 35
- Package: `com.taskmind.app`
- 21 unit tests passing (extraction pipeline)

[Unreleased]: https://github.com/notrishabhjain/tm/compare/v0.1.0-pipeline...HEAD
[0.1.0-pipeline]: https://github.com/notrishabhjain/tm/releases/tag/v0.1.0-pipeline
