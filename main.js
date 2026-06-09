/* =========================================================================
   main.js  ==  "The Boss" (Main Process)
   -------------------------------------------------------------------------
   Runs in a full Node.js environment. It is the entry point of the app.
   Responsibilities:
     - Create and manage the application window (BrowserWindow)
     - Build the native menu bar + keyboard shortcuts
     - Create the system tray icon
     - Talk to the operating system: file dialogs, file system, printing
     - Answer messages from the renderer through IPC (ipcMain.handle)
   The renderer (the screen) can NEVER touch the file system directly.
   It must ask the Boss through the safe bridge in preload.js.
   ========================================================================= */

const {
    app,
    BrowserWindow,
    ipcMain,
    dialog,
    Menu,
    Tray,
    shell
} = require('electron');

const path = require('path');
const fs = require('fs');

let mainWindow;
let tray = null;

/* On Windows, native notifications need an Application User Model ID.
   Setting it here makes the app name show correctly on save notifications. */
app.setAppUserModelId('com.quicknotetaker.app');

/* =========================================================================
   DATA FILE PATHS
   -------------------------------------------------------------------------
   We use app.getPath('userData') (NOT __dirname) so the files are written
   to a private, writable folder for the app:
       Windows -> C:\Users\<you>\AppData\Roaming\quick-note-taker
   This is REQUIRED for the packaged .exe to work, because the installed app
   folder is read-only.
   ========================================================================= */

const notesPath = path.join(app.getPath('userData'), 'notes.json');
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

/* ---------------------- NOTES STORAGE HELPERS ---------------------------- */

function readNotes() {
    if (!fs.existsSync(notesPath)) {
        fs.writeFileSync(notesPath, '[]');
    }
    try {
        return JSON.parse(fs.readFileSync(notesPath, 'utf-8'));
    } catch (err) {
        // If the file is somehow corrupted, start fresh instead of crashing.
        return [];
    }
}

function writeNotes(notes) {
    fs.writeFileSync(notesPath, JSON.stringify(notes, null, 2));
}

/* ---------------------- SETTINGS STORAGE HELPERS ------------------------- */

const defaultSettings = {
    fontSize: 18,
    darkMode: false,
    recentFiles: []
};

function readSettings() {
    if (!fs.existsSync(settingsPath)) {
        fs.writeFileSync(settingsPath, JSON.stringify(defaultSettings, null, 2));
    }
    try {
        // Merge with defaults so missing keys never break the app.
        return { ...defaultSettings, ...JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) };
    } catch (err) {
        return { ...defaultSettings };
    }
}

function writeSettings(settings) {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

/* Keep a short "recent files" list (most recent first, max 5, no duplicates). */
function addRecentFile(filePath) {
    const settings = readSettings();
    let recent = settings.recentFiles.filter(p => p !== filePath);
    recent.unshift(filePath);
    recent = recent.slice(0, 5);
    settings.recentFiles = recent;
    writeSettings(settings);
    buildMenu(); // Rebuild the File menu so the new recent file shows up.
}

/* =========================================================================
   CREATE THE MAIN WINDOW
   ========================================================================= */

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 720,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,   // renderer and preload run in separate worlds
            nodeIntegration: false    // renderer has NO direct Node.js access (secure)
        }
    });

    mainWindow.loadFile('index.html');

    // Hide the window instead of quitting when the user clicks the X.
    // The app keeps running in the system tray.
    mainWindow.on('close', (event) => {
        if (!app.isQuiting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });
}

/* =========================================================================
   NATIVE MENU BAR  (+ keyboard shortcuts via "accelerator")
   buildMenu() is called again whenever the recent-files list changes.
   ========================================================================= */

function buildMenu() {
    const settings = readSettings();

    // Build the "Open Recent" submenu from the saved recent files list.
    const recentItems = settings.recentFiles.length
        ? settings.recentFiles.map(filePath => ({
            label: path.basename(filePath),
            click: () => mainWindow.webContents.send('menu-open-recent', filePath)
        }))
        : [{ label: '(No recent files)', enabled: false }];

    const template = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'New Note',
                    accelerator: 'CmdOrCtrl+N',
                    click: () => mainWindow.webContents.send('menu-new-note')
                },
                {
                    label: 'Open File...',
                    accelerator: 'CmdOrCtrl+O',
                    click: () => mainWindow.webContents.send('menu-open-file')
                },
                {
                    label: 'Open Recent',
                    submenu: recentItems
                },
                { type: 'separator' },
                {
                    label: 'Save',
                    accelerator: 'CmdOrCtrl+S',
                    click: () => mainWindow.webContents.send('menu-save')
                },
                {
                    label: 'Save As...',
                    accelerator: 'CmdOrCtrl+Shift+S',
                    click: () => mainWindow.webContents.send('menu-save-as')
                },
                { type: 'separator' },
                {
                    label: 'Export as PDF...',
                    accelerator: 'CmdOrCtrl+E',
                    click: () => mainWindow.webContents.send('menu-export-pdf')
                },
                {
                    label: 'Print...',
                    accelerator: 'CmdOrCtrl+P',
                    click: () => mainWindow.webContents.send('menu-print')
                },
                { type: 'separator' },
                { role: 'quit' }
            ]
        },
        {
            label: 'View',
            submenu: [
                {
                    label: 'Toggle Trash Bin',
                    accelerator: 'CmdOrCtrl+T',
                    click: () => mainWindow.webContents.send('menu-toggle-trash')
                },
                { type: 'separator' },
                {
                    label: 'Zoom In',
                    accelerator: 'CmdOrCtrl+Plus',
                    click: () => {
                        const z = mainWindow.webContents.getZoomFactor();
                        mainWindow.webContents.setZoomFactor(Math.min(z + 0.1, 2.0));
                    }
                },
                {
                    label: 'Zoom Out',
                    accelerator: 'CmdOrCtrl+-',
                    click: () => {
                        const z = mainWindow.webContents.getZoomFactor();
                        mainWindow.webContents.setZoomFactor(Math.max(z - 0.1, 0.5));
                    }
                },
                {
                    label: 'Reset Zoom',
                    accelerator: 'CmdOrCtrl+0',
                    click: () => mainWindow.webContents.setZoomFactor(1.0)
                }
            ]
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: 'Keyboard Shortcuts',
                    accelerator: 'CmdOrCtrl+/',
                    click: () => mainWindow.webContents.send('menu-shortcuts')
                }
            ]
        }
    ];

    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* =========================================================================
   SYSTEM TRAY
   ========================================================================= */

function createTray() {
    const iconPath = path.join(__dirname, 'emoji.png');
    tray = new Tray(iconPath);
    tray.setToolTip('Quick Note Taker');

    const trayMenu = Menu.buildFromTemplate([
        { label: 'Show App', click: () => mainWindow.show() },
        {
            label: 'Quit',
            click: () => {
                app.isQuiting = true;
                app.quit();
            }
        }
    ]);

    tray.setContextMenu(trayMenu);
    tray.on('double-click', () => mainWindow.show());
}

/* =========================================================================
   HELPER: build a printable HTML page from a note (used by PDF + Print)
   ========================================================================= */

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function buildPrintableHtml(title, content) {
    return `<!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8">
        <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #111; }
            h1 { font-size: 26px; border-bottom: 2px solid #2563eb; padding-bottom: 8px; }
            pre { white-space: pre-wrap; word-wrap: break-word; font-size: 15px; line-height: 1.6;
                  font-family: 'Segoe UI', Arial, sans-serif; }
        </style></head>
        <body>
            <h1>${escapeHtml(title || 'Untitled')}</h1>
            <pre>${escapeHtml(content || '')}</pre>
        </body>
        </html>`;
}

/* Create a hidden window, load the note HTML, and run a callback once ready.
   Used for both "Export as PDF" and "Print". */
function withPrintWindow(html, callback) {
    const printWindow = new BrowserWindow({
        show: false,
        webPreferences: { sandbox: true }
    });
    printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    printWindow.webContents.once('did-finish-load', () => callback(printWindow));
}

/* =========================================================================
   APP LIFECYCLE
   ========================================================================= */

app.whenReady().then(() => {
    createWindow();
    buildMenu();
    createTray();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

/* =========================================================================
   IPC HANDLERS  ==  the renderer asks, the Boss answers
   Each handler below has ONE matching method in preload.js.
   ========================================================================= */

/* ---- Multiple notes (JSON storage) ---- */

ipcMain.handle('get-notes', () => readNotes());

ipcMain.handle('save-note', (event, note) => {
    const notes = readNotes();
    const index = notes.findIndex(n => n.id === note.id);
    if (index >= 0) {
        notes[index] = { ...notes[index], ...note };
    } else {
        notes.push(note);
    }
    writeNotes(notes);
    return notes;
});

/* delete = SOFT delete (move to trash). The note is kept but marked deleted. */
ipcMain.handle('delete-note', (event, id) => {
    const notes = readNotes();
    const index = notes.findIndex(n => n.id === id);
    if (index >= 0) {
        notes[index].deleted = true;
        notes[index].deletedAt = new Date().toISOString();
    }
    writeNotes(notes);
    return notes;
});

/* ---- Trash bin: restore / permanently delete / empty ---- */

ipcMain.handle('restore-note', (event, id) => {
    const notes = readNotes();
    const index = notes.findIndex(n => n.id === id);
    if (index >= 0) {
        notes[index].deleted = false;
        delete notes[index].deletedAt;
    }
    writeNotes(notes);
    return notes;
});

ipcMain.handle('permanently-delete-note', (event, id) => {
    const notes = readNotes().filter(n => n.id !== id);
    writeNotes(notes);
    return notes;
});

ipcMain.handle('empty-trash', () => {
    const notes = readNotes().filter(n => !n.deleted);
    writeNotes(notes);
    return notes;
});

/* ---- Pin a note ---- */

ipcMain.handle('toggle-pin', (event, id) => {
    const notes = readNotes();
    const index = notes.findIndex(n => n.id === id);
    if (index >= 0) {
        notes[index].pinned = !notes[index].pinned;
    }
    writeNotes(notes);
    return notes;
});

/* ---- Settings (font size, dark mode) ---- */

ipcMain.handle('get-settings', () => readSettings());

ipcMain.handle('save-settings', (event, partial) => {
    const settings = { ...readSettings(), ...partial };
    writeSettings(settings);
    return settings;
});

/* ---- Save As: pick a location and write a .txt file ---- */

ipcMain.handle('save-as', async (event, content) => {
    const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Note As',
        defaultPath: 'note.txt',
        filters: [{ name: 'Text Files', extensions: ['txt'] }]
    });
    if (!result.canceled) {
        fs.writeFileSync(result.filePath, content, 'utf-8');
        addRecentFile(result.filePath);
        return { success: true, filePath: result.filePath };
    }
    return { success: false };
});

/* ---- Smart Save: write to the currently open file, or fall back ---- */

ipcMain.handle('smart-save', (event, { content, filePath }) => {
    const target = filePath || path.join(app.getPath('documents'), 'quicknote.txt');
    fs.writeFileSync(target, content, 'utf-8');
    addRecentFile(target);
    return { success: true, filePath: target };
});

/* ---- Open File: pick a .txt file and return its contents ---- */

ipcMain.handle('open-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [{ name: 'Text Files', extensions: ['txt'] }]
    });
    if (!result.canceled) {
        const filePath = result.filePaths[0];
        const content = fs.readFileSync(filePath, 'utf-8');
        addRecentFile(filePath);
        return { success: true, content, filePath };
    }
    return { success: false };
});

/* ---- Open a recent file by its path (from the File > Open Recent menu) ---- */

ipcMain.handle('read-file-path', (event, filePath) => {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        addRecentFile(filePath);
        return { success: true, content, filePath };
    } catch (err) {
        dialog.showErrorBox('Cannot open file', 'The file could not be found:\n' + filePath);
        return { success: false };
    }
});

/* ---- NEW FEATURE: Export a note as a PDF (webContents.printToPDF) ---- */

ipcMain.handle('export-pdf', async (event, { title, content }) => {
    const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Export Note as PDF',
        defaultPath: (title || 'note') + '.pdf',
        filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
    });
    if (result.canceled) {
        return { success: false };
    }

    const html = buildPrintableHtml(title, content);

    return new Promise((resolve) => {
        withPrintWindow(html, async (printWindow) => {
            try {
                const pdfData = await printWindow.webContents.printToPDF({
                    printBackground: true,
                    pageSize: 'A4'
                });
                fs.writeFileSync(result.filePath, pdfData);
                printWindow.destroy();
                shell.openPath(result.filePath); // open the PDF for the user
                resolve({ success: true, filePath: result.filePath });
            } catch (err) {
                printWindow.destroy();
                resolve({ success: false, error: err.message });
            }
        });
    });
});

/* ---- NEW FEATURE: Print a note (webContents.print) ---- */

ipcMain.handle('print-note', (event, { title, content }) => {
    const html = buildPrintableHtml(title, content);
    return new Promise((resolve) => {
        withPrintWindow(html, (printWindow) => {
            printWindow.webContents.print({ silent: false, printBackground: true }, () => {
                printWindow.destroy();
                resolve({ success: true });
            });
        });
    });
});
