const {
    app,
    BrowserWindow,
    ipcMain,
    dialog,
    Menu,
    Tray
} = require('electron');

const path = require('path');
const fs = require('fs');

let mainWindow;
let tray = null;

/* CREATE WINDOW */

function createWindow() {

    mainWindow = new BrowserWindow({

        width: 1200,
        height: 700,

        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.loadFile('index.html');

    createMenu();

    createTray();
}

/* CREATE MENU */

function createMenu() {

    const template = [

        {
            label: 'File',

            submenu: [

                {
                    label: 'New Note',

                    click: () => {
                        mainWindow.webContents.send('menu-new-note');
                    }
                },

                {
                    label: 'Open File',

                    click: () => {
                        mainWindow.webContents.send('menu-open-file');
                    }
                },

                {
                    label: 'Save',

                    click: () => {
                        mainWindow.webContents.send('menu-save');
                    }
                },

                {
                    label: 'Save As',

                    click: () => {
                        mainWindow.webContents.send('menu-save-as');
                    }
                },

                { type: 'separator' },

                { role: 'quit' }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);

    Menu.setApplicationMenu(menu);
}

/* CREATE TRAY */

function createTray() {

    const iconPath = path.join(__dirname, 'emoji.png');

    tray = new Tray(iconPath);

    tray.setToolTip('Quick Note Taker');

    const trayMenu = Menu.buildFromTemplate([

        {
            label: 'Show App',

            click: () => {
                mainWindow.show();
            }
        },

        {
            label: 'Quit',

            click: () => {
                app.isQuiting = true;
                app.quit();
            }
        }
    ]);

    tray.setContextMenu(trayMenu);

    tray.on('click', () => {
        mainWindow.show();
    });

    mainWindow.on('close', (event) => {

        if (!app.isQuiting) {

            event.preventDefault();

            mainWindow.hide();
        }
    });
}

/* APP READY */

app.whenReady().then(() => {

    createWindow();

    app.on('activate', () => {

        if (BrowserWindow.getAllWindows().length === 0) {

            createWindow();
        }
    });
});

/* WINDOWS CLOSE */

app.on('window-all-closed', () => {

    if (process.platform !== 'darwin') {

        app.quit();
    }
});

/* NOTES STORAGE */

const notesPath = path.join(__dirname, 'notes.json');

/* READ NOTES */

function readNotes() {

    if (!fs.existsSync(notesPath)) {

        fs.writeFileSync(notesPath, '[]');
    }

    return JSON.parse(fs.readFileSync(notesPath));
}

/* WRITE NOTES */

function writeNotes(notes) {

    fs.writeFileSync(
        notesPath,
        JSON.stringify(notes, null, 2)
    );
}

/* GET NOTES */

ipcMain.handle('get-notes', () => {

    return readNotes();
});

/* SAVE NOTE */

ipcMain.handle('save-note', (event, note) => {

    const notes = readNotes();

    const index = notes.findIndex(
        n => n.id === note.id
    );

    if (index >= 0) {

        notes[index] = note;

    } else {

        notes.push(note);
    }

    writeNotes(notes);

    return notes;
});

/* DELETE NOTE */

ipcMain.handle('delete-note', (event, id) => {

    let notes = readNotes();

    notes = notes.filter(
        note => note.id !== id
    );

    writeNotes(notes);

    return notes;
});

/* SAVE AS */

ipcMain.handle('save-as', async (event, content) => {

    const result = await dialog.showSaveDialog({

        title: 'Save Note As',

        defaultPath: 'note.txt',

        filters: [
            {
                name: 'Text Files',
                extensions: ['txt']
            }
        ]
    });

    if (!result.canceled) {

        fs.writeFileSync(
            result.filePath,
            content,
            'utf-8'
        );

        return {
            success: true,
            filePath: result.filePath
        };
    }

    return {
        success: false
    };
});

/* OPEN FILE */

ipcMain.handle('open-file', async () => {

    const result = await dialog.showOpenDialog({

        properties: ['openFile'],

        filters: [
            {
                name: 'Text Files',
                extensions: ['txt']
            }
        ]
    });

    if (!result.canceled) {

        const content = fs.readFileSync(
            result.filePaths[0],
            'utf-8'
        );

        return {
            success: true,
            content
        };
    }

    return {
        success: false
    };
});