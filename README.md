# Quick Note Taker — Extended Edition

A cross-platform desktop note-taking app built with **Electron** for the Software
Engineering final project. It stores multiple notes, supports full file management,
and adds several new features on top of the version built in class.

---

## 5.1 Group Information

> ⚠️ **Fill in your real group details before submitting.**

- **Course Code:** [OE303001]
- **Group Number:** [Group X]

| Full Name        | Student ID   | Role (features built)                          |
|------------------|--------------|------------------------------------------------|
| [Member 1 Name]  | [Student ID] | Export as PDF                                  |
| [Member 2 Name]  | [Student ID] | Print a note + Zoom in/out                     |
| [Member 3 Name]  | [Student ID] | Trash Bin (restore / permanent delete)         |
| [Member 4 Name]  | [Student ID] | Recent Files menu + Keyboard Shortcut cheat sheet |

> The feature → member mapping above is a suggestion. Reassign it to match who
> actually built/understands each feature, since the exam is graded individually.

---

## 5.2 App Description

Quick Note Taker is a desktop app for writing and organizing many notes in one place.
Notes are stored in a JSON file with a title, optional category, content and
timestamps. The app has a sidebar to browse, search, filter, and pin notes; a rich
editor with live word/character count; auto-save; dark mode; font-size control; a
native menu bar with keyboard shortcuts; and a system tray icon so it keeps running
in the background. On top of the class version, it can export a note to PDF, print a
note, recover deleted notes from a trash bin, reopen recent files, and show a
keyboard-shortcut cheat sheet.

---

## 5.3 New Features Added (beyond what was built in class)

### 1. Export a note as a PDF
- **Built by:** [Member 1]
- **How it works:** The renderer sends the current note's title and content to the
  main process. Main builds a clean printable HTML page, loads it into a hidden
  `BrowserWindow`, and calls `webContents.printToPDF()` to generate PDF bytes, which
  are written to a location chosen with a native save dialog. The PDF is then opened
  automatically with `shell.openPath()`.
- **Files modified:** `main.js` (`export-pdf` handler, `buildPrintableHtml`,
  `withPrintWindow`), `preload.js` (`exportPdf`), `renderer.js` (Export PDF button),
  `index.html` (button).

### 2. Print a note
- **Built by:** [Member 2]
- **How it works:** Same hidden-window technique as PDF export, but calls
  `webContents.print()` to open the native OS print dialog so the user can print to
  any printer.
- **Files modified:** `main.js` (`print-note` handler), `preload.js` (`printNote`),
  `renderer.js` (Print button), `index.html` (button).

### 3. Trash Bin (restore or permanently delete)
- **Built by:** [Member 3]
- **How it works:** Deleting a note is now a **soft delete** — the note gets
  `deleted: true` and a `deletedAt` timestamp instead of being erased. A "Toggle Trash
  Bin" view (View menu / `Ctrl+T`) lists deleted notes, where each can be **Restored**
  or **Deleted forever**. "Empty Trash" removes all of them at once.
- **Files modified:** `main.js` (`delete-note` is now soft; `restore-note`,
  `permanently-delete-note`, `empty-trash` handlers), `preload.js` (matching bridge
  methods), `renderer.js` (`toggleTrashView`, trash rendering), `index.html` (trash UI).

### 4. Recent Files list in the File menu
- **Built by:** [Member 4]
- **How it works:** Every time a `.txt` file is opened or saved, its path is added to
  a `recentFiles` list (max 5, no duplicates) in `settings.json`. The native **File →
  Open Recent** submenu is rebuilt from this list. Clicking an entry reads that file
  back into the editor.
- **Files modified:** `main.js` (`addRecentFile`, `buildMenu` recent submenu,
  `read-file-path` handler), `preload.js` (`readFilePath`, `onMenuOpenRecent`),
  `renderer.js` (recent-file open handler).

### 5. Keyboard Shortcut cheat sheet
- **Built by:** [Member 4]
- **How it works:** **Help → Keyboard Shortcuts** (`Ctrl+/`) opens an in-app modal
  listing every shortcut. The menu in main sends a message to the renderer, which
  shows the modal.
- **Files modified:** `main.js` (Help menu item), `preload.js` (`onMenuShortcuts`),
  `renderer.js` (modal logic), `index.html` (modal markup + styles).

### 6. Zoom in / out / reset
- **Built by:** [Member 2]
- **How it works:** The View menu uses `webContents.setZoomFactor()` /
  `getZoomFactor()` to scale the whole UI (`Ctrl+ +`, `Ctrl+ -`, `Ctrl+0`).
- **Files modified:** `main.js` (View menu zoom items).

> This is **6** new features — the guideline requires a minimum of 4.

### Class features that are all still working
Create/edit/delete notes, save to JSON, auto-load on startup, **auto-save (5s
debounce)**, **Save As**, **Open File**, **Smart Save**, **New Note with unsaved
warning**, **App Menu + keyboard shortcuts**, **System Tray (hide/show)**, **note
sidebar**, **live word & character count**, **font-size control (saved)**, **native
notification on save**, **dark/light mode (saved)**, **real-time search**, **pin a
note**, **note categories with color badges + filter**.

---

## 5.4 How to Run the App (from source)

1. Install **Node.js** from https://nodejs.org
2. Open a terminal in the project folder.
3. Install dependencies:
   ```
   npm install
   ```
4. Start the app:
   ```
   npm start
   ```

---

## 5.5 How to Install the App (packaged)

- **Windows:** Run `dist/Quick Note Taker Setup 1.0.0.exe` and follow the installer.
- **macOS:** Open the `.dmg` in `dist/` and drag the app into Applications.

### How to rebuild the installer yourself
```
npm run dist
```
The installer is created in the `dist/` folder.

> **Windows build note:** building is configured with `signAndEditExecutable: false`
> in `package.json` so it works **without administrator rights or Developer Mode**
> (this avoids electron-builder's code-signing cache, which needs symlink privileges
> on Windows). The trade-off is the app uses the default Electron icon. To ship a
> custom icon, enable **Developer Mode** (or run the terminal **as Administrator**),
> add `"icon": "build/icon.ico"` under `build`, and rebuild.

---

## Project Structure

| File           | Role (kitchen analogy)        | What it does                                   |
|----------------|-------------------------------|------------------------------------------------|
| `main.js`      | The Boss / chef               | Window, menu, tray, file system, IPC handlers  |
| `preload.js`   | The safe walkie-talkie        | Exposes a safe `window.electronAPI` bridge     |
| `index.html`   | The face / screen             | Layout + styles (CSS variables for theming)    |
| `renderer.js`  | The brain of the screen       | Clicks, typing, UI updates, calls the bridge   |
| `package.json` | Recipe + ingredients          | Scripts, dependencies, electron-builder config |

### Where data is stored
Notes and settings are saved in the app's private user-data folder
(`app.getPath('userData')`), e.g. on Windows:
`C:\Users\<you>\AppData\Roaming\quick-note-taker\` — as `notes.json` and
`settings.json`. (Using this folder instead of the install folder is what lets the
**packaged** app save files without permission errors.)
