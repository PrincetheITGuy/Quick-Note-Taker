/* =========================================================================
   renderer.js  ==  "The Brain of the Screen" (Renderer Process)
   -------------------------------------------------------------------------
   Runs inside the page (Chromium). It listens to clicks and typing, updates
   the UI, and asks the Boss (main.js) to do anything that needs the OS or
   the file system, always through window.electronAPI (the safe bridge).
   ========================================================================= */

/* ---------------- GRAB ELEMENTS ---------------- */
const notesList = document.getElementById('notesList');
const noteTitle = document.getElementById('noteTitle');
const noteCategory = document.getElementById('noteCategory');
const noteContent = document.getElementById('noteContent');
const searchInput = document.getElementById('searchInput');
const categoryFilter = document.getElementById('categoryFilter');
const listTitle = document.getElementById('listTitle');
const emptyTrashBtn = document.getElementById('emptyTrashBtn');

const newNoteBtn = document.getElementById('newNoteBtn');
const saveBtn = document.getElementById('saveBtn');
const saveAsBtn = document.getElementById('saveAsBtn');
const openFileBtn = document.getElementById('openFileBtn');
const exportPdfBtn = document.getElementById('exportPdfBtn');
const printBtn = document.getElementById('printBtn');
const deleteBtn = document.getElementById('deleteBtn');
const fontUpBtn = document.getElementById('fontUpBtn');
const fontDownBtn = document.getElementById('fontDownBtn');
const themeBtn = document.getElementById('themeBtn');

const wordCountEl = document.getElementById('word-count');
const saveStatusEl = document.getElementById('save-status');

const shortcutsModal = document.getElementById('shortcutsModal');
const closeShortcutsBtn = document.getElementById('closeShortcutsBtn');

/* ---------------- STATE ---------------- */
let notes = [];               // all notes loaded from notes.json
let currentNoteId = null;     // id of the note currently in the editor
let currentFilePath = null;   // path of an opened .txt file (for Smart Save)
let isDirty = false;          // true when there are unsaved changes
let viewMode = 'notes';       // 'notes' or 'trash'
let fontSize = 18;
let darkMode = false;
let debounceTimer = null;     // holds the auto-save countdown timer id

/* ---------------- LIVE WORD / CHARACTER COUNT ---------------- */
function updateWordCount() {
    const text = noteContent.value;
    const characters = text.length;
    const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
    wordCountEl.innerText = `Words: ${words} | Characters: ${characters}`;
}

/* ---------------- CATEGORY COLOR (deterministic from the name) ----------- */
const categoryPalette = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];
function categoryColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return categoryPalette[Math.abs(hash) % categoryPalette.length];
}

/* Rebuild the category filter dropdown from the categories currently in use. */
function populateCategoryFilter() {
    const previous = categoryFilter.value;
    const categories = [...new Set(
        notes.filter(n => !n.deleted && n.category).map(n => n.category)
    )].sort();

    categoryFilter.innerHTML = '<option value="">All categories</option>';
    categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        categoryFilter.appendChild(opt);
    });
    categoryFilter.value = previous; // keep the user's current choice if still valid
}

/* ---------------- RENDER THE SIDEBAR LIST ---------------- */
function renderNotes() {
    notesList.innerHTML = '';
    const search = searchInput.value.toLowerCase();
    const catFilter = categoryFilter.value;

    // 1) Choose notes vs trash, then apply search + category filters.
    let visible = notes.filter(note => {
        if (viewMode === 'trash') {
            if (!note.deleted) return false;
        } else {
            if (note.deleted) return false;
            if (catFilter && note.category !== catFilter) return false;
        }
        const haystack = (note.title + ' ' + note.content).toLowerCase();
        return haystack.includes(search);
    });

    // 2) Sort: pinned first, then most recently updated.
    visible.sort((a, b) => {
        if (viewMode === 'notes') {
            if ((b.pinned ? 1 : 0) !== (a.pinned ? 1 : 0)) {
                return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
            }
        }
        return new Date(b.updatedAt) - new Date(a.updatedAt);
    });

    // 3) Draw each card.
    visible.forEach(note => {
        const div = document.createElement('div');
        div.classList.add('note-item');
        if (note.id === currentNoteId) div.classList.add('active');

        const badge = note.category
            ? `<span class="category-badge" style="background:${categoryColor(note.category)}">${note.category}</span>`
            : '';

        if (viewMode === 'trash') {
            div.innerHTML = `
                <strong>${note.title}</strong>
                <small>Deleted: ${new Date(note.deletedAt).toLocaleString()}</small>
                ${badge}
                <div class="trash-actions">
                    <button class="restore">↩ Restore</button>
                    <button class="purge" style="background:#ef4444">❌ Delete forever</button>
                </div>`;
            div.querySelector('.restore').addEventListener('click', async () => {
                notes = await window.electronAPI.restoreNote(note.id);
                refreshUI();
            });
            div.querySelector('.purge').addEventListener('click', async () => {
                if (confirm('Permanently delete this note? This cannot be undone.')) {
                    notes = await window.electronAPI.permanentlyDeleteNote(note.id);
                    refreshUI();
                }
            });
        } else {
            const pinIcon = note.pinned ? '📌' : '📍';
            div.innerHTML = `
                <button class="pin-btn ${note.pinned ? 'pinned' : ''}" title="Pin note">${pinIcon}</button>
                <strong>${note.title}</strong>
                <small>${new Date(note.updatedAt).toLocaleString()}</small>
                ${badge}`;

            // Pin button (stopPropagation so it does not also open the note).
            div.querySelector('.pin-btn').addEventListener('click', async (e) => {
                e.stopPropagation();
                notes = await window.electronAPI.togglePin(note.id);
                refreshUI();
            });

            // Click the card to open the note in the editor.
            div.addEventListener('click', () => loadNoteIntoEditor(note));
        }

        notesList.appendChild(div);
    });
}

/* Refresh everything that depends on the notes array. */
function refreshUI() {
    populateCategoryFilter();
    renderNotes();
}

/* ---------------- LOAD A NOTE INTO THE EDITOR ---------------- */
function loadNoteIntoEditor(note) {
    if (!confirmDiscardIfDirty()) return;
    currentNoteId = note.id;
    currentFilePath = null;        // this came from the notes list, not a .txt file
    noteTitle.value = note.title;
    noteCategory.value = note.category || '';
    noteContent.value = note.content;
    updateWordCount();
    isDirty = false;
    saveStatusEl.innerText = '';
    renderNotes();                 // re-highlight the active card
}

/* Ask before throwing away unsaved changes. Returns true if OK to continue. */
function confirmDiscardIfDirty() {
    if (!isDirty) return true;
    return confirm('You have unsaved changes.\n\nPress OK to discard them, or Cancel to stay.');
}

/* ---------------- DETECT TYPING (mark dirty + auto-save) ---------------- */
function onEditChanged() {
    isDirty = true;
    updateWordCount();
    saveStatusEl.innerText = 'Changes detected — auto-save soon...';

    // Debounce: restart a 5-second countdown on every keystroke.
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(autoSave, 5000);
}

noteTitle.addEventListener('input', onEditChanged);
noteCategory.addEventListener('input', onEditChanged);
noteContent.addEventListener('input', onEditChanged);

/* ---------------- SAVE LOGIC ---------------- */
function buildCurrentNote() {
    return {
        id: currentNoteId || Date.now(),
        title: noteTitle.value || 'Untitled',
        category: noteCategory.value.trim(),
        content: noteContent.value,
        pinned: getCurrentNote() ? !!getCurrentNote().pinned : false,
        deleted: false,
        createdAt: getCurrentNote() ? getCurrentNote().createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
}

function getCurrentNote() {
    return notes.find(n => n.id === currentNoteId) || null;
}

/* Saves the note in the editor to notes.json. Used by both manual + auto save. */
async function saveCurrentNote() {
    const note = buildCurrentNote();
    currentNoteId = note.id;
    notes = await window.electronAPI.saveNote(note);
    isDirty = false;
    refreshUI();
    return note;
}

/* Auto-save fires after 5s of no typing — silently, no notification. */
async function autoSave() {
    if (!isDirty) {
        saveStatusEl.innerText = 'No changes — already saved';
        return;
    }
    await saveCurrentNote();
    saveStatusEl.innerText = 'Auto-saved at ' + new Date().toLocaleTimeString();
}

/* Manual Save button: save + show a native notification. */
saveBtn.addEventListener('click', async () => {
    await saveCurrentNote();
    saveStatusEl.innerText = 'Saved at ' + new Date().toLocaleTimeString();
    new Notification('Quick Note Taker', { body: 'Note saved successfully ✅' });
});

/* ---------------- NEW NOTE ---------------- */
newNoteBtn.addEventListener('click', () => {
    if (!confirmDiscardIfDirty()) return;
    currentNoteId = null;
    currentFilePath = null;
    noteTitle.value = '';
    noteCategory.value = '';
    noteContent.value = '';
    updateWordCount();
    isDirty = false;
    saveStatusEl.innerText = '';
    noteTitle.focus();
    renderNotes();
});

/* ---------------- DELETE (soft -> trash) ---------------- */
deleteBtn.addEventListener('click', async () => {
    if (!currentNoteId) return;
    if (!confirm('Move this note to the Trash Bin?')) return;
    notes = await window.electronAPI.deleteNote(currentNoteId);
    currentNoteId = null;
    noteTitle.value = '';
    noteCategory.value = '';
    noteContent.value = '';
    updateWordCount();
    isDirty = false;
    refreshUI();
});

/* ---------------- TRASH BIN TOGGLE + EMPTY ---------------- */
function toggleTrashView() {
    viewMode = viewMode === 'notes' ? 'trash' : 'notes';
    listTitle.innerText = viewMode === 'trash' ? '🗑 Trash Bin' : 'My Notes';
    emptyTrashBtn.style.display = viewMode === 'trash' ? 'inline' : 'none';
    renderNotes();
}

emptyTrashBtn.addEventListener('click', async () => {
    if (confirm('Permanently delete ALL notes in the trash? This cannot be undone.')) {
        notes = await window.electronAPI.emptyTrash();
        refreshUI();
    }
});

/* ---------------- SAVE AS (.txt) ---------------- */
saveAsBtn.addEventListener('click', async () => {
    const result = await window.electronAPI.saveAs(noteContent.value);
    if (result.success) {
        currentFilePath = result.filePath;
        saveStatusEl.innerText = 'Saved to ' + result.filePath;
        isDirty = false;
    }
});

/* ---------------- OPEN FILE (.txt) ---------------- */
openFileBtn.addEventListener('click', async () => {
    if (!confirmDiscardIfDirty()) return;
    const result = await window.electronAPI.openFile();
    if (result.success) loadOpenedFile(result);
});

function loadOpenedFile(result) {
    currentNoteId = null;
    currentFilePath = result.filePath;
    noteTitle.value = 'Opened: ' + result.filePath.split(/[\\/]/).pop();
    noteContent.value = result.content;
    noteCategory.value = '';
    updateWordCount();
    isDirty = false;
    saveStatusEl.innerText = 'Opened ' + result.filePath;
    renderNotes();
}

/* ---------------- EXPORT AS PDF (new feature) ---------------- */
exportPdfBtn.addEventListener('click', async () => {
    const result = await window.electronAPI.exportPdf({
        title: noteTitle.value,
        content: noteContent.value
    });
    if (result.success) {
        saveStatusEl.innerText = 'Exported PDF: ' + result.filePath;
    }
});

/* ---------------- PRINT (new feature) ---------------- */
printBtn.addEventListener('click', async () => {
    await window.electronAPI.printNote({
        title: noteTitle.value,
        content: noteContent.value
    });
});

/* ---------------- FONT SIZE CONTROL (saved preference) ---------------- */
function applyFontSize() {
    fontSize = Math.min(32, Math.max(10, fontSize)); // clamp 10..32
    noteContent.style.fontSize = fontSize + 'px';
}

fontUpBtn.addEventListener('click', () => {
    fontSize += 2;
    applyFontSize();
    window.electronAPI.saveSettings({ fontSize });
});

fontDownBtn.addEventListener('click', () => {
    fontSize -= 2;
    applyFontSize();
    window.electronAPI.saveSettings({ fontSize });
});

/* ---------------- DARK MODE TOGGLE (saved preference) ---------------- */
function applyDarkMode() {
    document.body.classList.toggle('dark-mode', darkMode);
    themeBtn.innerText = darkMode ? '☀️' : '🌙';
}

themeBtn.addEventListener('click', () => {
    darkMode = !darkMode;
    applyDarkMode();
    window.electronAPI.saveSettings({ darkMode });
});

/* ---------------- KEYBOARD SHORTCUT CHEAT SHEET ---------------- */
function showShortcuts() {
    shortcutsModal.classList.add('show');
}
closeShortcutsBtn.addEventListener('click', () => shortcutsModal.classList.remove('show'));
shortcutsModal.addEventListener('click', (e) => {
    if (e.target === shortcutsModal) shortcutsModal.classList.remove('show');
});

/* ---------------- MENU EVENTS (main -> renderer) ---------------- */
window.electronAPI.onMenuNewNote(() => newNoteBtn.click());
window.electronAPI.onMenuOpenFile(() => openFileBtn.click());
window.electronAPI.onMenuSave(() => saveBtn.click());
window.electronAPI.onMenuSaveAs(() => saveAsBtn.click());
window.electronAPI.onMenuExportPdf(() => exportPdfBtn.click());
window.electronAPI.onMenuPrint(() => printBtn.click());
window.electronAPI.onMenuToggleTrash(() => toggleTrashView());
window.electronAPI.onMenuShortcuts(() => showShortcuts());
window.electronAPI.onMenuOpenRecent(async (filePath) => {
    if (!confirmDiscardIfDirty()) return;
    const result = await window.electronAPI.readFilePath(filePath);
    if (result.success) loadOpenedFile(result);
});

/* ---------------- SEARCH + CATEGORY FILTER ---------------- */
searchInput.addEventListener('input', renderNotes);
categoryFilter.addEventListener('change', renderNotes);

/* ---------------- STARTUP ---------------- */
async function init() {
    // Load saved settings (font size + dark mode).
    const settings = await window.electronAPI.getSettings();
    fontSize = settings.fontSize || 18;
    darkMode = !!settings.darkMode;
    applyFontSize();
    applyDarkMode();

    // Load all notes from notes.json.
    notes = await window.electronAPI.getNotes();
    refreshUI();
    updateWordCount();
}

init();
