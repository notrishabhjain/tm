# Changelog

All notable changes to TaskMind are documented here.

## [Unreleased]

### Added

- Initial project scaffold with Expo Development Build
- GitHub Actions CI/CD pipeline (lint, test, build-debug, build-release, generate-keystore)
- Database schema with Drizzle ORM (8 tables)
- Domain layer: types, entities, use cases
- Extraction pipeline: language detection, rule engine, priority assignment, confidence aggregation
- Custom Notification Listener native module (Kotlin + TypeScript interface)
- UI theme system (colors, typography, spacing)
- Core UI components: TaskCard, PriorityChip, SourceAppChip, Button, EmptyState
- All screens: Home, Confirmations, History, Settings, Task Detail, Onboarding (7 screens), Diagnostics
- Zustand state stores: task, settings, diagnostics
- 200+ seed keywords for EN/HI/Hinglish task detection
- Diagnostics screen with 5 tabs for no-local-IDE debugging
