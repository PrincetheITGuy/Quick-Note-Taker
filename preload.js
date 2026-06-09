/* =========================================================================
   preload.js  ==  "The Safe Bridge"
   -------------------------------------------------------------------------
   Runs in the renderer BEFORE the web page loads, but with limited access.
   It uses contextBridge to expose a small, safe set of functions on
   window.electronAPI. The renderer can ONLY use these functions, it can
   never touch Node.js or the file system directly. This is the secure
   pattern recommended by Electron (context isolation).

   RULE: one ipcMain.handle in main.js  ==  one line here.
   - invoke  -> two-way   (renderer asks, waits for an answer)
   - on      -> one-way   (main pushes a message, renderer just listens)
   ========================================================================= */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {

    /* ----- Notes ----- */
    getNotes: () => ipcRenderer.invoke('get-notes'),
    saveNote: (note) => ipcRenderer.invoke('save-note', note),
    deleteNote: (id) => ipcRenderer.invoke('delete-note', id),

    /* ----- Trash bin ----- */
    restoreNote: (id) => ipcRenderer.invoke('restore-note', id),
    permanentlyDeleteNote: (id) => ipcRenderer.invoke('permanently-delete-note', id),
    emptyTrash: () => ipcRenderer.invoke('empty-trash'),

    /* ----- Pin ----- */
    togglePin: (id) => ipcRenderer.invoke('toggle-pin', id),

    /* ----- Settings (font size, dark mode) ----- */
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (partial) => ipcRenderer.invoke('save-settings', partial),

    /* ----- File operations ----- */
    saveAs: (content) => ipcRenderer.invoke('save-as', content),
    smartSave: (payload) => ipcRenderer.invoke('smart-save', payload),
    openFile: () => ipcRenderer.invoke('open-file'),
    readFilePath: (filePath) => ipcRenderer.invoke('read-file-path', filePath),

    /* ----- New features: PDF + Print ----- */
    exportPdf: (payload) => ipcRenderer.invoke('export-pdf', payload),
    printNote: (payload) => ipcRenderer.invoke('print-note', payload),

    /* ----- Menu actions (main -> renderer, one-way) ----- */
    onMenuNewNote: (cb) => ipcRenderer.on('menu-new-note', cb),
    onMenuOpenFile: (cb) => ipcRenderer.on('menu-open-file', cb),
    onMenuOpenRecent: (cb) => ipcRenderer.on('menu-open-recent', (e, filePath) => cb(filePath)),
    onMenuSave: (cb) => ipcRenderer.on('menu-save', cb),
    onMenuSaveAs: (cb) => ipcRenderer.on('menu-save-as', cb),
    onMenuExportPdf: (cb) => ipcRenderer.on('menu-export-pdf', cb),
    onMenuPrint: (cb) => ipcRenderer.on('menu-print', cb),
    onMenuToggleTrash: (cb) => ipcRenderer.on('menu-toggle-trash', cb),
    onMenuShortcuts: (cb) => ipcRenderer.on('menu-shortcuts', cb)
});
