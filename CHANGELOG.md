# Change Log

All notable changes to the **Unity GUID Usage Finder** extension will be documented in this file.

This project follows the spirit of [Keep a Changelog](https://keepachangelog.com/) and uses semantic versioning-style release notes.

---

## [Unreleased]

### Planned

* Improve filtering UX further with more advanced matching options.
* Add optional marketplace/demo screenshots or GIF support to the README.
* Continue polishing extension configuration and workflow controls.

---

## [0.1.0] - 2026-04-28

### Added

* Added GUID-based Unity script usage scanning from VSCode.
* Added support for scanning Unity serialized asset files, including:

  * `.unity`
  * `.prefab`
  * `.asset`
  * `.controller`
  * `.overrideController`
  * `.anim`
  * `.mat`
* Added right-click commands for Unity `.cs` scripts:

  * Find script usages by GUID
  * Copy script GUID
* Added a dedicated **Unity GUID Finder** activity bar view.
* Added a **Script Usages** tree view for scan results.
* Added grouped result categories:

  * Scenes
  * Prefabs
  * Assets / ScriptableObjects
  * Animators
  * Animations
  * Materials
* Added clickable result entries that open the matching serialized file at the GUID reference line.
* Added best-effort GameObject name detection for MonoBehaviour references in Unity YAML.
* Added result counts to grouped result headers.
* Added a filter system for scan results.
* Added a visible filter indicator row with match count.
* Added clickable filter indicator for editing the current filter.
* Added a clear-filter command that only appears when a filter is active.
* Added persistent scan history across VSCode sessions.
* Added a separate **Scan History** tree view.
* Added clickable history entries that restore previous scan results.
* Added current-scan highlighting in history.
* Added commands to:

  * Refresh the last scan
  * Clear current results
  * Clear scan history
  * Reveal usage files in the VSCode Explorer
  * Open all current usage results
* Added progress notifications during scans.
* Added scan cancellation support.
* Added parallel scanning with configurable batch size.
* Added debounced auto-refresh when Unity serialized assets change.
* Added extension settings for scan behavior and performance:

  * `unityGuidUsageFinder.includeGlobs`
  * `unityGuidUsageFinder.excludeGlob`
  * `unityGuidUsageFinder.scanBatchSize`
  * `unityGuidUsageFinder.autoRefresh`
  * `unityGuidUsageFinder.autoRefreshDebounceMs`
  * `unityGuidUsageFinder.maxHistoryEntries`
  * `unityGuidUsageFinder.showQuickPickAfterScan`
  * `unityGuidUsageFinder.openSelectedUsageFromQuickPick`

### Changed

* Improved the results tree with built-in VSCode icons and color accents.
* Improved scan output formatting in the Unity GUID Usage Finder output channel.
* Improved filtering so empty result groups are hidden.
* Improved result display by showing file names, relative paths, line numbers, and GameObject names when available.
* Improved command reuse by centralizing usage-opening logic.

### Fixed

* Fixed command registration and activation issues.
* Fixed incorrect menu contribution placement in `package.json`.
* Fixed broken JSON caused by comments in `package.json`.
* Fixed reveal-in-explorer behavior for tree item context menu commands.
* Fixed duplicated/noisy results by deduplicating references per file.
* Fixed background task configuration issues caused by invalid esbuild problem matcher references.

### Known Limitations

* Only text-serialized Unity assets can be scanned.
* Binary Unity assets are not supported.
* GameObject name detection is best-effort and depends on Unity YAML structure.
* Very large projects may still take some time to scan depending on disk speed and configured batch size.
