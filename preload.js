const {
    contextBridge,
    ipcRenderer
} = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {

    getNotes: () =>
        ipcRenderer.invoke('get-notes'),

    saveNote: (note) =>
        ipcRenderer.invoke('save-note', note),

    deleteNote: (id) =>
        ipcRenderer.invoke('delete-note', id),

    saveAs: (content) =>
        ipcRenderer.invoke('save-as', content),

    openFile: () =>
        ipcRenderer.invoke('open-file'),

    onMenuNewNote: (callback) =>
        ipcRenderer.on('menu-new-note', callback),

    onMenuOpenFile: (callback) =>
        ipcRenderer.on('menu-open-file', callback),

    onMenuSave: (callback) =>
        ipcRenderer.on('menu-save', callback),

    onMenuSaveAs: (callback) =>
        ipcRenderer.on('menu-save-as', callback)
});