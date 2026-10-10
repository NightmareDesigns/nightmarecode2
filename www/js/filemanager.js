class FileManager {
    constructor() {
        this.files = this.loadFiles();
        this.currentFile = this.getInitialFile();
        this.fileHandles = new Map();
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
        const stored = localStorage.getItem('nightmare_files');
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
        localStorage.setItem('nightmare_files', JSON.stringify(this.files));
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

    async importFile(file) {
        if (!file || !file.name) return;

        try {
            const content = await file.text();
            this.openFileContent(file.name, content);
        } catch (error) {
            alert(`Could not open ${file.name}: ${error.message}`);
        }
    }

    openFileContent(fileName, content, fileId = null) {
        if (Object.prototype.hasOwnProperty.call(this.files, fileName)) {
            this.files[fileName].content = content;
        } else {
            this.files[fileName] = { name: fileName, content, type: 'text' };
        }

        if (fileId) this.fileHandles.set(fileName, fileId);
        this.saveFiles();
        this.currentFile = fileName;
        this.updateEditor();
        this.updateTabs();
        this.renderFileTree();
    }

    setCurrentFileHandle(fileName, fileId) {
        if (fileId) this.fileHandles.set(fileName, fileId);
    }

    getCurrentContent() {
        const editor = document.getElementById('codeEditor');
        if (editor && this.currentFile && this.files[this.currentFile]) {
            this.files[this.currentFile].content = editor.value;
        }
        this.saveFiles();
        return this.currentFile ? this.files[this.currentFile]?.content || '' : '';
    }

    downloadFile(fileName, content) {
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName || 'untitled.txt';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
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
            const icon = document.createElement('span');
            icon.className = 'file-icon';
            icon.textContent = '📄';
            const name = document.createElement('span');
            name.className = 'file-name';
            name.textContent = fileName;
            fileItem.append(icon, name);
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
            const name = document.createElement('span');
            name.className = 'tab-name';
            name.textContent = fileName;
            const closeButton = document.createElement('button');
            closeButton.className = 'tab-close';
            closeButton.type = 'button';
            closeButton.dataset.file = fileName;
            closeButton.setAttribute('aria-label', `Close ${fileName}`);
            closeButton.textContent = '×';

            name.addEventListener('click', () => this.switchFile(fileName));
            closeButton.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteFile(fileName);
            });

            tab.append(name, closeButton);
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
            openFileBtn.addEventListener('click', () => window.appMenu?.openFile());
        }

        const editor = document.getElementById('codeEditor');
        if (!editor) return;

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
window.fileManager = fileManager;
