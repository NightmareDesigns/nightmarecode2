class FileManager {
    constructor() {
        this.files = this.loadFiles();
        this.currentFile = 'untitled.txt';
        this.init();
    }

    init() {
        this.renderFileTree();
        this.attachEventListeners();
    }

    loadFiles() {
        const stored = localStorage.getItem('nightmare_files');
        if (stored) {
            return JSON.parse(stored);
        }
        return {
            'untitled.txt': { name: 'untitled.txt', content: '', type: 'text' }
        };
    }

    saveFiles() {
        localStorage.setItem('nightmare_files', JSON.stringify(this.files));
    }

    createNewFile() {
        let name = 'untitled';
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
        // Save current file content
        const editor = document.getElementById('codeEditor');
        if (this.currentFile && this.files[this.currentFile]) {
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
        const lines = editor.value.split('\n').length;
        lineNumbers.innerHTML = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
    }

    updateStatusBar() {
        const editor = document.getElementById('codeEditor');
        const fileType = this.getFileType(this.currentFile);
        const size = new Blob([editor.value]).size;
        const lines = editor.value.split('\n');
        const currentLine = editor.value.substring(0, editor.selectionStart).split('\n').length;
        const currentColumn = editor.selectionStart - editor.value.lastIndexOf('\n', editor.selectionStart - 1);

        document.getElementById('lineCount').textContent = currentLine;
        document.getElementById('columnCount').textContent = currentColumn;
        document.getElementById('fileType').textContent = fileType;
        document.getElementById('fileSize').textContent = size + ' B';
    }

    getFileType(fileName) {
        const ext = fileName.split('.').pop().toLowerCase();
        const types = {
            'py': 'Python',
            'js': 'JavaScript',
            'html': 'HTML',
            'css': 'CSS',
            'sh': 'Shell',
            'txt': 'Plain Text',
            'json': 'JSON',
            'md': 'Markdown'
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
            const firstFile = Object.keys(this.files)[0];
            this.switchFile(firstFile);
        } else {
            this.renderFileTree();
            this.updateTabs();
        }
    }

    renderFileTree() {
        const fileTree = document.getElementById('fileTree');
        fileTree.innerHTML = '';
        Object.keys(this.files).forEach(fileName => {
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
        tabContainer.innerHTML = '';
        Object.keys(this.files).forEach(fileName => {
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
        newFileBtn.addEventListener('click', () => this.createNewFile());

        const editor = document.getElementById('codeEditor');
        editor.addEventListener('input', () => this.updateLineNumbers());
        editor.addEventListener('input', () => this.updateStatusBar());
        editor.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.saveCurrentFile();
            }
            if (e.ctrlKey && e.key === 'n') {
                e.preventDefault();
                this.createNewFile();
            }
        });
    }

    saveCurrentFile() {
        const editor = document.getElementById('codeEditor');
        if (this.files[this.currentFile]) {
            this.files[this.currentFile].content = editor.value;
            this.saveFiles();
            console.log(`✓ File saved: ${this.currentFile}`);
        }
    }
}

// Initialize File Manager
const fileManager = new FileManager();