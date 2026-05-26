const notesList = document.getElementById('notesList');

const noteTitle = document.getElementById('noteTitle');

const noteContent = document.getElementById('noteContent');

const newNoteBtn = document.getElementById('newNoteBtn');

const saveBtn = document.getElementById('saveBtn');

const saveAsBtn = document.getElementById('saveAsBtn');

const openFileBtn = document.getElementById('openFileBtn');

const deleteBtn = document.getElementById('deleteBtn');

let notes = [];

let currentNoteId = null;

let isDirty = false;

/* WORD COUNT FUNCTION */

function updateWordCount() {

    const text = noteContent.value;

    const characters = text.length;

    const words = text.trim() === ''
        ? 0
        : text.trim().split(/\s+/).length;

    const wordCountEl =
        document.getElementById('word-count');

    wordCountEl.innerText =
        `Words: ${words} | Characters: ${characters}`;
}

/* DETECT CHANGES */

noteTitle.addEventListener('input', () => {

    isDirty = true;
});

noteContent.addEventListener('input', () => {

    isDirty = true;

    updateWordCount();
});

/* LOAD NOTES */

async function loadNotes() {

    notes = await window.electronAPI.getNotes();

    renderNotes();
}

/* RENDER NOTES */

function renderNotes() {

    notesList.innerHTML = '';

    notes.forEach(note => {

        const div = document.createElement('div');

        div.classList.add('note-item');

        div.innerHTML = `
            <strong>${note.title}</strong>
            <br>
            <small>${new Date(note.updatedAt).toLocaleString()}</small>
        `;

        div.addEventListener('click', () => {

            currentNoteId = note.id;

            noteTitle.value = note.title;

            noteContent.value = note.content;

            updateWordCount();

            isDirty = false;
        });

        notesList.appendChild(div);
    });
}

/* NEW NOTE */

newNoteBtn.addEventListener('click', async () => {

    if (isDirty) {

        const confirmed = confirm(
            'You have unsaved changes.\n\nPress OK to discard changes or Cancel to stay.'
        );

        if (!confirmed) {

            return;
        }
    }

    const newNote = {

        id: Date.now(),

        title: 'Untitled',

        content: '',

        updatedAt: new Date().toISOString()
    };

    notes.unshift(newNote);

    currentNoteId = newNote.id;

    renderNotes();

    noteTitle.value = newNote.title;

    noteContent.value = '';

    updateWordCount();

    isDirty = false;
});

/* SAVE NOTE */

saveBtn.addEventListener('click', async () => {

    const note = {

        id: currentNoteId || Date.now(),

        title: noteTitle.value || 'Untitled',

        content: noteContent.value,

        updatedAt: new Date().toISOString()
    };

    currentNoteId = note.id;

    notes = await window.electronAPI.saveNote(note);

    renderNotes();

    isDirty = false;
});

/* DELETE NOTE */

deleteBtn.addEventListener('click', async () => {

    if (!currentNoteId) return;

    const confirmed = confirm(
        'Are you sure you want to delete this note?'
    );

    if (!confirmed) {

        return;
    }

    notes = await window.electronAPI.deleteNote(currentNoteId);

    noteTitle.value = '';

    noteContent.value = '';

    currentNoteId = null;

    updateWordCount();

    renderNotes();

    isDirty = false;
});

/* SAVE AS */

saveAsBtn.addEventListener('click', async () => {

    await window.electronAPI.saveAs(
        noteContent.value
    );

    isDirty = false;
});

/* OPEN FILE */

openFileBtn.addEventListener('click', async () => {

    const result = await window.electronAPI.openFile();

    if (result.success) {

        noteTitle.value = 'Opened File';

        noteContent.value = result.content;

        updateWordCount();

        isDirty = false;
    }
});

/* MENU EVENTS */

window.electronAPI.onMenuNewNote(() => {

    newNoteBtn.click();
});

window.electronAPI.onMenuOpenFile(() => {

    openFileBtn.click();
});

window.electronAPI.onMenuSave(() => {

    saveBtn.click();
});

window.electronAPI.onMenuSaveAs(() => {

    saveAsBtn.click();
});

/* START */

loadNotes();

updateWordCount();