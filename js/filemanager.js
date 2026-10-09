class FileManager {
    constructor() {
        this.files = this.loadFiles();
        this.currentFile = this.getInitialFile();
        this.init();
    }

    init() {
        this.renderFileTree();
        this.attachEventListeners();
        this.updateEditor();
        this.updateTabs();
    }

    getInitialFile() {
        if (this.files['untitled.txt']) return 'untitled.txt';
        const fileNames = Object.keys(this.files);
        return fileNames.length > 0 ? fileNames[0] : null;
    }

    loadFiles() {
        let stored;
        try {
            stored = localStorage.getItem('nightmare_files');
        } catch (_) {
            // Editing remains available when browser storage is disabled.
        }
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
                    return parsed;
                }
            } catch (err) {
                console.warn('Invalid saved files in localStorage, resetting.', err);
            }
        }
        return {
            'untitled.txt': { name: 'untitled.txt', content: '', type: 'text' }
        };
    }

    saveFiles() {
        try {
            localStorage.setItem('nightmare_files', JSON.stringify(this.files));
        } catch (_) {
            console.warn('Browser storage unavailable; files remain in memory.');
        }
    }

    createNewFile() {
        const name = 'untitled';
        let counter = 1;
        while (this.files[`${name}${counter}.txt`]) {
            counter++;
        }
        const newFileName = `${name}${counter}.txt`;
        this.files[newFileName] = { name: newFileName, content: '', type: 'text' };
        this.saveFiles();
        this.renderFileTree();
        this.switchFile(newFileName);
    }

    switchFile(fileName) {
        if (!this.files[fileName]) return;

        // Save current file content
        const editor = document.getElementById('codeEditor');
        if (editor && this.currentFile && this.files[this.currentFile]) {
            this.files[this.currentFile].content = editor.value;
        }

        this.currentFile = fileName;
        this.saveFiles();
        this.updateEditor();
        this.updateTabs();
        this.renderFileTree();
    }

    updateEditor() {
        const editor = document.getElementById('codeEditor');
        if (!editor || !this.currentFile) return;

        const file = this.files[this.currentFile];
        if (file) {
            editor.value = file.content;
            this.updateLineNumbers();
            this.updateStatusBar();
        }
    }

    updateLineNumbers() {
        const editor = document.getElementById('codeEditor');
        const lineNumbers = document.getElementById('lineNumbers');
        if (!editor || !lineNumbers) return;

        const lines = editor.value.split('\n').length;
        lineNumbers.innerHTML = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
    }

    updateStatusBar() {
        const editor = document.getElementById('codeEditor');
        if (!editor) return;

        const fileType = this.currentFile ? this.getFileType(this.currentFile) : 'Plain Text';
        const size = new Blob([editor.value]).size;
        const currentLine = editor.value.substring(0, editor.selectionStart).split('\n').length;
        const lastNewlineIndex = editor.value.lastIndexOf('\n', Math.max(0, editor.selectionStart - 1));
        const currentColumn = editor.selectionStart - lastNewlineIndex;

        const lineCountEl = document.getElementById('lineCount');
        const columnCountEl = document.getElementById('columnCount');
        const fileTypeEl = document.getElementById('fileType');
        const fileSizeEl = document.getElementById('fileSize');

        if (lineCountEl) lineCountEl.textContent = String(currentLine);
        if (columnCountEl) columnCountEl.textContent = String(currentColumn);
        if (fileTypeEl) fileTypeEl.textContent = fileType;
        if (fileSizeEl) fileSizeEl.textContent = size + ' B';
    }

    getFileType(fileName) {
        const ext = fileName.split('.').pop().toLowerCase();
        const types = {
            py: 'Python',
            js: 'JavaScript',
            html: 'HTML',
            css: 'CSS',
            sh: 'Shell',
            txt: 'Plain Text',
            json: 'JSON',
            md: 'Markdown'
        };
        return types[ext] || 'Unknown';
    }

    deleteFile(fileName) {
        if (Object.keys(this.files).length <= 1) {
            alert('Cannot delete the last file!');
            return;
        }

        delete this.files[fileName];
        this.saveFiles();

        if (this.currentFile === fileName) {
            const firstFile = Object.keys(this.files)[0] || null;
            this.currentFile = firstFile;
            this.updateEditor();
        }

        this.renderFileTree();
        this.updateTabs();
    }

    renderFileTree() {
        const fileTree = document.getElementById('fileTree');
        if (!fileTree) return;

        fileTree.innerHTML = '';
        Object.keys(this.files).forEach((fileName) => {
            const fileItem = document.createElement('div');
            fileItem.className = `file-item ${fileName === this.currentFile ? 'active' : ''}`;
            fileItem.dataset.file = fileName;
            fileItem.innerHTML = `
                <span class="file-icon">📄</span>
                <span class="file-name">${fileName}</span>
            `;
            fileItem.addEventListener('click', () => this.switchFile(fileName));
            fileTree.appendChild(fileItem);
        });
    }

    updateTabs() {
        const tabContainer = document.querySelector('.tab-container');
        if (!tabContainer) return;

        tabContainer.innerHTML = '';
        Object.keys(this.files).forEach((fileName) => {
            const tab = document.createElement('div');
            tab.className = `tab ${fileName === this.currentFile ? 'active' : ''}`;
            tab.dataset.file = fileName;
            tab.innerHTML = `
                <span class="tab-name">${fileName}</span>
                <button class="tab-close" data-file="${fileName}">×</button>
            `;

            tab.querySelector('.tab-name').addEventListener('click', () => this.switchFile(fileName));
            tab.querySelector('.tab-close').addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteFile(fileName);
            });

            tabContainer.appendChild(tab);
        });
    }

    attachEventListeners() {
        const newFileBtn = document.getElementById('newFileBtn');
        if (newFileBtn) {
            newFileBtn.addEventListener('click', () => this.createNewFile());
        }

        const openFileBtn = document.getElementById('openFileBtn');
        if (openFileBtn) {
            openFileBtn.addEventListener('click', () => {
                const fileName = prompt('Enter file name:');
                if (!fileName) return;

                if (!this.files[fileName]) {
                    this.files[fileName] = { name: fileName, content: '', type: 'text' };
                    this.saveFiles();
                }
                this.switchFile(fileName);
            });
        }

        const editor = document.getElementById('codeEditor');
        if (!editor) return;

        editor.addEventListener('scroll', () => {
            const lineNumbers = document.getElementById('lineNumbers');
            if (lineNumbers) lineNumbers.scrollTop = editor.scrollTop;
        });

        editor.addEventListener('input', () => {
            this.updateLineNumbers();
            this.updateStatusBar();

            if (this.currentFile && this.files[this.currentFile]) {
                this.files[this.currentFile].content = editor.value;
            }
        });

        editor.addEventListener('click', () => this.updateStatusBar());
        editor.addEventListener('keyup', () => this.updateStatusBar());

        editor.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                this.saveCurrentFile();
            }

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
                e.preventDefault();
                this.createNewFile();
            }
        });
    }

    saveCurrentFile() {
        const editor = document.getElementById('codeEditor');
        if (!editor || !this.currentFile) return;

        if (this.files[this.currentFile]) {
            this.files[this.currentFile].content = editor.value;
            this.saveFiles();
            console.log(`✓ File saved: ${this.currentFile}`);
        }
    }
}

// Initialize File Manager
const fileManager = new FileManager();
