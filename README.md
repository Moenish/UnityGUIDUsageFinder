# 🧭 Unity GUID Usage Finder

![Version](https://img.shields.io/badge/version-0.1.0-blue)
![VSCode](https://img.shields.io/badge/VSCode-%5E1.90.0-007ACC)
![Unity](https://img.shields.io/badge/Unity-YAML%20GUID%20Scanning-black)
![License](https://img.shields.io/badge/license-MIT-green)

Find where your Unity scripts are actually used — in **Scenes, Prefabs, ScriptableObjects, Animations, and more** — directly inside VSCode.

No more guessing. No more opening Unity just to track references.

---

## ✨ Features

### 🔍 Find Script Usages by GUID

Right-click any `.cs` file → **Find Script Usages**

* Scans Unity serialized files (`.prefab`, `.unity`, `.asset`, etc.)
* Finds all references using the script’s GUID
* Groups results by type:

  * Scenes
  * Prefabs
  * ScriptableObjects
  * Animations / Animators
  * Materials

---

### 📂 Interactive Results Panel

* Click any result → jumps to file + line
* Shows **GameObject name** (when available)
* Grouped and counted:

```
Prefabs (12)
Scenes (3)
```

---

### 🔎 Smart Filtering

* Filter by:

  * File name
  * GameObject name
* Live filtering in sidebar
* Visual indicator:

```
Filter: "enemy" — 6 match(es)
```

* Click the filter row to edit it
* Clear button auto-hides when not needed

---

### ⚡ Fast Scanning

* Parallel file scanning
* Configurable batch size
* Progress indicator + cancel support

---

### 🔄 Auto Refresh

* Automatically updates results when Unity assets change
* Debounced to avoid excessive rescans
* Fully configurable

---

### 🕘 Scan History

* Stores recent scans (persisted between sessions)
* Separate **History panel**
* Click to restore results instantly
* Highlights current active scan

---

### 🧰 Utility Commands

* Copy script GUID
* Reveal usage in Explorer
* Open all usages at once
* Clear results / history

---

## ⚙️ Extension Settings

### 🔍 Scanning Settings

* `unityGuidUsageFinder.includeGlobs`
  Files to scan

* `unityGuidUsageFinder.excludeGlob`
  Folders to ignore

* `unityGuidUsageFinder.scanBatchSize`
  Parallel scan size (default: 12)

---

### 🔄 Auto Refresh Settings

* `unityGuidUsageFinder.autoRefresh`
  Enable/disable auto refresh

* `unityGuidUsageFinder.autoRefreshDebounceMs`
  Delay before refresh (default: 750ms)

---

### 🧠 Behavior Settings

* `unityGuidUsageFinder.showQuickPickAfterScan`
  Show result picker after scan

* `unityGuidUsageFinder.openSelectedUsageFromQuickPick`
  Open selected result automatically

---

### 🕘 History Settings

* `unityGuidUsageFinder.maxHistoryEntries`
  Number of stored scans (0 = disabled)

---

## 🧩 Requirements

* Unity project with `.meta` files
* Text-serialized assets (YAML)

---

## ⚠️ Known Limitations

* Does not scan binary Unity assets
* Very large projects may take time to scan

---

## 🚀 Why this exists

Unity knows where scripts are used.
VSCode doesn’t.

This bridges that gap.

---

## 📝 Release Notes

### 0.1.0

* Initial release
* GUID-based usage scanning
* Results tree view
* GameObject name detection
* Filtering system
* Persistent scan history
* Auto-refresh support
* Configurable performance

## 🤖 Development Note

This extension was developed with the assistance of AI tools.  
All design decisions, implementation, and validation were guided and reviewed by the author.
