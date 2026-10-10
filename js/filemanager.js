class FileManager {
    constructor() {
        this.files = this.loadFiles();
        this.currentFile = this.getInitialFile();
        this.workspaceName = '';
        this.workspaceId = null;
        this.workspaceFiles = [];
        this.desktop = Boolean(window.desktopApp?.isDesktop);
        this.saveTimer = null;
        this.mobileSaveSequence = 0;
        this.pendingMobileSaves = new Map();
        this.init();
        window.fileManager = this;
    }

    init() {
        this.renderFileTree();
        this.attachEventListeners();
        this.updateEditor();
        this.updateTabs();
    }

    getInitialFile() {
        const names = Object.keys(this.files);
        return names.includes('untitled.txt') ? 'untitled.txt' : names[0] || null;
    }

    loadFiles() {
        const files = Object.create(null);
        try {
            const stored = JSON.parse(localStorage.getItem('nightmare_files') || '{}');
            if (stored && typeof stored === 'object') {
                const savedFiles = stored.files && typeof stored.files === 'object' ? stored.files : stored;
                for (const [name, file] of Object.entries(savedFiles)) {
                    if (typeof name === 'string' && file && typeof file.content === 'string') {
                        files[name] = {
                            name,
                            content: file.content,
                            loaded: true,
                            dirty: false,
                            isWorkspaceFile: false,
                            token: file.token || null
                        };
                    }
                }
            }
        } catch (error) {
            console.warn('Invalid saved editor recovery data.', error);
        }
        if (Object.keys(files).length === 0) {
            files['untitled.txt'] = { name: 'untitled.txt', content: '', loaded: true, dirty: false };
        }
        return files;
    }

    saveFiles() {
        try {
            const recoverable = {};
            for (const [name, file] of Object.entries(this.files)) {
                if (!file.isWorkspaceFile && file.loaded && typeof file.content === 'string') {
                    recoverable[name] = { content: file.content };
                }
            }
            localStorage.setItem('nightmare_files', JSON.stringify({ version: 1, files: recoverable }));
            if (this.workspaceId) {
                const drafts = {};
                for (const [name, file] of Object.entries(this.files)) {
                    if (file.isWorkspaceFile && file.loaded && file.dirty) drafts[name] = { content: file.content };
                }
                localStorage.setItem(`nightmare_workspace_${this.workspaceId}`, JSON.stringify(drafts));
            }
        } catch (error) {
            this.setStatus('Recovery storage is full or unavailable.', true);
        }
    }

    setStatus(message, isError = false) {
        const status = document.getElementById('saveStatus');
        if (!status) return;
        status.textContent = message;
        status.classList.toggle('error', isError);
    }

    notify(message) {
        const notification = document.getElementById('notification');
        if (!notification) return;
        notification.textContent = message;
        notification.classList.add('visible');
        clearTimeout(this.notificationTimer);
        this.notificationTimer = setTimeout(() => notification.classList.remove('visible'), 2600);
    }

    currentEditorContent() {
        const editor = document.getElementById('codeEditor');
        return editor ? editor.value : '';
    }

    captureCurrentContent() {
        if (!this.currentFile || !this.files[this.currentFile]) return;
        const file = this.files[this.currentFile];
        file.content = this.currentEditorContent();
        file.loaded = true;
    }

    createNewFile() {
        let counter = 1;
        let name = `untitled${counter}.txt`;
        while (this.files[name]) name = `untitled${++counter}.txt`;
        this.files[name] = {
            name,
            content: '',
            loaded: true,
            dirty: false,
            isWorkspaceFile: Boolean(this.workspaceName)
        };
        this.saveFiles();
        this.renderFileTree();
        this.switchFile(name);
    }

    async switchFile(fileName) {
        if (!this.files[fileName]) return;
        if (this.currentFile === fileName) return;
        const requestId = (this.switchRequest || 0) + 1;
        this.switchRequest = requestId;
        this.captureCurrentContent();
        this.saveFiles();
        this.currentFile = fileName;
        const file = this.files[fileName];
        if (!file.loaded && file.isWorkspaceFile) {
            try {
                file.content = await window.desktopApp.readWorkspaceFile(fileName);
                file.loaded = true;
                file.dirty = false;
                this.saveFiles();
            } catch (error) {
                if (this.switchRequest !== requestId) return;
                this.notify(`Could not open ${fileName}: ${error.message}`);
                this.setStatus('Open failed', true);
                return;
            }
        }
        if (this.switchRequest !== requestId) return;
        this.updateEditor();
        this.updateTabs();
        this.renderFileTree();
    }

    updateEditor() {
        const editor = document.getElementById('codeEditor');
        const file = this.currentFile && this.files[this.currentFile];
        if (!editor || !file) return;
        editor.value = file.content || '';
        this.updateLineNumbers();
        this.updateHighlight();
        this.updateStatusBar();
        this.setStatus(file.dirty ? 'Unsaved changes' : 'Ready');
    }

    updateLineNumbers() {
        const editor = document.getElementById('codeEditor');
        const lineNumbers = document.getElementById('lineNumbers');
        if (!editor || !lineNumbers) return;
        lineNumbers.textContent = Array.from({ length: editor.value.split('\n').length }, (_, index) => index + 1).join('\n');
    }

    updateHighlight() {
        const editor = document.getElementById('codeEditor');
        const code = document.getElementById('highlightedCode');
        if (!editor || !code) return;
        const extensions = {
            py: 'python', js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
            html: 'xml', css: 'css', sh: 'bash', json: 'json', md: 'markdown', java: 'java',
            cs: 'csharp', cpp: 'cpp', c: 'c', go: 'go', rs: 'rust', php: 'php', xml: 'xml',
            yml: 'yaml', yaml: 'yaml', toml: 'toml', sql: 'sql'
        };
        const extension = this.currentFile?.split('.').pop().toLowerCase();
        const language = extensions[extension];
        const source = editor.value || ' ';
        try {
            const highlighted = language && window.hljs?.getLanguage(language)
                ? window.hljs.highlight(source, { language, ignoreIllegals: true }).value
                : null;
            code.innerHTML = highlighted || this.escapeHTML(source);
            code.className = highlighted ? `hljs language-${language}` : 'hljs';
        } catch {
            code.textContent = source;
            code.className = 'hljs';
        }
        this.syncHighlightScroll();
    }

    escapeHTML(text) {
        return text.replace(/[&<>"]/g, (character) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;'
        })[character]);
    }

    syncHighlightScroll() {
        const editor = document.getElementById('codeEditor');
        const code = document.getElementById('highlightedCode');
        const lineNumbers = document.getElementById('lineNumbers');
        if (editor && code) code.style.transform = `translate(${-editor.scrollLeft}px, ${-editor.scrollTop}px)`;
        if (editor && lineNumbers) lineNumbers.style.transform = `translateY(${-editor.scrollTop}px)`;
    }

    updateStatusBar() {
        const editor = document.getElementById('codeEditor');
        if (!editor) return;
        const fileType = this.currentFile ? this.getFileType(this.currentFile) : 'Plain Text';
        const size = new Blob([editor.value]).size;
        const currentLine = editor.value.slice(0, editor.selectionStart).split('\n').length;
        const lastNewlineIndex = editor.value.lastIndexOf('\n', Math.max(0, editor.selectionStart - 1));
        const currentColumn = editor.selectionStart - lastNewlineIndex;
        document.getElementById('lineCount').textContent = String(currentLine);
        document.getElementById('columnCount').textContent = String(currentColumn);
        document.getElementById('fileType').textContent = fileType;
        document.getElementById('fileSize').textContent = `${size} B`;
    }

    getFileType(fileName) {
        const ext = fileName.split('.').pop().toLowerCase();
        const types = {
            py: 'Python', js: 'JavaScript', jsx: 'JavaScript JSX', ts: 'TypeScript', tsx: 'TypeScript JSX',
            html: 'HTML', css: 'CSS', sh: 'Shell', txt: 'Plain Text', json: 'JSON', md: 'Markdown',
            java: 'Java', cs: 'C#', cpp: 'C++', c: 'C', go: 'Go', rs: 'Rust', php: 'PHP', xml: 'XML',
            yml: 'YAML', yaml: 'YAML', toml: 'TOML', sql: 'SQL'
        };
        return types[ext] || 'Plain Text';
    }

    deleteFile(fileName) {
        if (!this.files[fileName]) return;
        if (this.files[fileName].dirty && !confirm(`Close ${fileName} and discard its unsaved editor changes?`)) return;
        delete this.files[fileName];
        if (this.currentFile === fileName) {
            const nextFile = Object.keys(this.files)[0] || this.workspaceFiles.find((entry) => !entry.directory)?.path;
            if (nextFile && !this.files[nextFile]) {
                this.files[nextFile] = {
                    name: nextFile,
                    content: '',
                    loaded: false,
                    dirty: false,
                    isWorkspaceFile: true
                };
            }
            if (!nextFile) {
                this.files['untitled.txt'] = {
                    name: 'untitled.txt',
                    content: '',
                    loaded: true,
                    dirty: false,
                    isWorkspaceFile: Boolean(this.workspaceName)
                };
                this.currentFile = 'untitled.txt';
                this.updateEditor();
            } else {
                this.currentFile = null;
                this.switchFile(nextFile);
            }
        }
        this.saveFiles();
        this.renderFileTree();
        this.updateTabs();
    }

    renderFileTree() {
        const fileTree = document.getElementById('fileTree');
        if (!fileTree) return;
        fileTree.replaceChildren();
        const filter = (document.getElementById('searchFiles')?.value || '').trim().toLowerCase();
        const workspaceNames = new Set(this.workspaceFiles.map((entry) => entry.path));
        const entries = this.workspaceFiles.filter((entry) => !entry.directory || entry.path.toLowerCase().includes(filter));
        for (const entry of entries) {
            if (filter && !entry.path.toLowerCase().includes(filter)) continue;
            const item = document.createElement('div');
            const isActive = entry.path === this.currentFile;
            item.className = `file-item${isActive ? ' active' : ''}${entry.directory ? ' directory' : ''}`;
            item.setAttribute('role', 'treeitem');
            item.setAttribute('aria-selected', String(isActive));
            item.style.paddingLeft = `${6 + (entry.path.split('/').length - 1) * 12}px`;
            const icon = document.createElement('span');
            icon.className = 'file-icon';
            icon.textContent = entry.directory ? '▸' : '📄';
            const label = document.createElement('span');
            label.className = 'file-name';
            label.textContent = entry.path.split('/').pop();
            item.append(icon, label);
            if (!entry.directory) {
                item.title = entry.path;
                item.addEventListener('click', () => {
                    if (!this.files[entry.path]) {
                        this.files[entry.path] = {
                            name: entry.path,
                            content: '',
                            loaded: false,
                            dirty: false,
                            isWorkspaceFile: true
                        };
                    }
                    this.switchFile(entry.path);
                });
            }
            fileTree.appendChild(item);
        }

        for (const [name, file] of Object.entries(this.files)) {
            if (file.isWorkspaceFile && workspaceNames.has(name)) continue;
            if (!name.toLowerCase().includes(filter)) continue;
            const item = document.createElement('div');
            const active = name === this.currentFile;
            item.className = `file-item${active ? ' active' : ''}`;
            item.setAttribute('role', 'treeitem');
            item.setAttribute('aria-selected', String(active));
            const icon = document.createElement('span');
            icon.className = 'file-icon';
            icon.textContent = '📄';
            const label = document.createElement('span');
            label.className = 'file-name';
            label.textContent = name;
            item.append(icon, label);
            item.addEventListener('click', () => this.switchFile(name));
            fileTree.appendChild(item);
        }
    }

    updateTabs() {
        const tabContainer = document.querySelector('.tab-container');
        if (!tabContainer) return;
        tabContainer.replaceChildren();
        for (const [fileName, file] of Object.entries(this.files)) {
            const tab = document.createElement('div');
            tab.className = `tab${fileName === this.currentFile ? ' active' : ''}`;
            tab.setAttribute('role', 'tab');
            tab.setAttribute('aria-selected', String(fileName === this.currentFile));
            const name = document.createElement('span');
            name.className = 'tab-name';
            name.textContent = `${fileName}${file.dirty ? ' •' : ''}`;
            name.title = fileName;
            name.addEventListener('click', () => this.switchFile(fileName));
            const close = document.createElement('button');
            close.className = 'tab-close';
            close.type = 'button';
            close.setAttribute('aria-label', `Close ${fileName}`);
            close.textContent = '×';
            close.addEventListener('click', () => this.deleteFile(fileName));
            tab.append(name, close);
            tabContainer.appendChild(tab);
        }
    }

    attachEventListeners() {
        document.getElementById('newFileBtn')?.addEventListener('click', () => this.createNewFile());
        document.getElementById('openFileBtn')?.addEventListener('click', () => this.openFile());
        document.getElementById('openWorkspaceBtn')?.addEventListener('click', () => this.openWorkspace());
        document.getElementById('searchFiles')?.addEventListener('input', () => this.renderFileTree());
        const editor = document.getElementById('codeEditor');
        if (!editor) return;
        editor.addEventListener('input', () => {
            this.captureCurrentContent();
            if (this.currentFile && this.files[this.currentFile]) this.files[this.currentFile].dirty = true;
            this.updateLineNumbers();
            this.updateHighlight();
            this.updateStatusBar();
            this.setStatus('Unsaved changes');
            this.updateTabs();
            clearTimeout(this.saveTimer);
            this.saveTimer = setTimeout(() => this.saveFiles(), 150);
        });
        editor.addEventListener('click', () => this.updateStatusBar());
        editor.addEventListener('keyup', () => this.updateStatusBar());
        editor.addEventListener('scroll', () => this.syncHighlightScroll(), { passive: true });
    }

    async openWorkspace() {
        if (!this.desktop) {
            this.notify('Open workspace folders are available in the desktop app. Use Open File in the browser.');
            return;
        }
        try {
            const workspace = await window.desktopApp.openWorkspace();
            if (!workspace) return;
            this.captureCurrentContent();
            this.saveFiles();
            this.workspaceName = workspace.name;
            this.workspaceId = workspace.id;
            this.workspaceFiles = workspace.files || [];
            let workspaceDrafts = {};
            try {
                workspaceDrafts = JSON.parse(localStorage.getItem(`nightmare_workspace_${this.workspaceId}`) || '{}');
            } catch {
                workspaceDrafts = {};
            }
            const nextFiles = Object.create(null);
            for (const entry of this.workspaceFiles) {
                if (entry.directory) continue;
                const draft = workspaceDrafts[entry.path];
                nextFiles[entry.path] = draft
                    ? { ...draft, name: entry.path, loaded: true, dirty: true, isWorkspaceFile: true }
                    : { name: entry.path, content: '', loaded: false, dirty: false, isWorkspaceFile: true };
            }
            this.files = nextFiles;
            this.currentFile = null;
            const first = this.workspaceFiles.find((entry) => !entry.directory);
            const label = document.getElementById('workspaceLabel');
            if (label) label.textContent = this.workspaceName;
            this.renderFileTree();
            this.updateTabs();
            if (first) await this.switchFile(first.path);
            else this.createNewFile();
            this.notify(`Opened workspace: ${this.workspaceName}`);
        } catch (error) {
            this.notify(`Could not open workspace: ${error.message}`);
        }
    }

    async openFile() {
        if (this.desktop) {
            try {
                const opened = await window.desktopApp.openFile();
                if (!opened) return;
                const key = this.uniqueName(opened.name);
                this.files[key] = {
                    name: key,
                    content: opened.content,
                    loaded: true,
                    dirty: false,
                    isWorkspaceFile: false,
                    token: opened.token
                };
                this.switchFile(key);
            } catch (error) {
                this.notify(`Could not open file: ${error.message}`);
            }
            return;
        }
        document.getElementById('browserFileInput')?.click();
    }

    uniqueName(name) {
        if (!this.files[name]) return name;
        const dot = name.lastIndexOf('.');
        const stem = dot > 0 ? name.slice(0, dot) : name;
        const ext = dot > 0 ? name.slice(dot) : '';
        let index = 2;
        while (this.files[`${stem} (${index})${ext}`]) index++;
        return `${stem} (${index})${ext}`;
    }

    async saveCurrentFile() {
        const file = this.currentFile && this.files[this.currentFile];
        if (!file) return;
        this.captureCurrentContent();
        const content = file.content;
        try {
            if (this.desktop && file.isWorkspaceFile) {
                await window.desktopApp.writeWorkspaceFile(this.currentFile, content);
            } else if (this.desktop && file.token) {
                await window.desktopApp.saveFile(file.token, content);
            } else if (this.desktop) {
                await this.saveAs();
                return;
            } else if (window.androidApp) {
                this.requestMobileSave(this.currentFile, file, content, !file.isWorkspaceFile);
                return;
            } else {
                this.downloadFile(this.currentFile, content);
            }
            file.dirty = false;
            this.saveFiles();
            this.updateTabs();
            this.setStatus('Saved');
            this.notify(`Saved ${this.currentFile}`);
        } catch (error) {
            this.setStatus('Save failed', true);
            this.notify(`Could not save file: ${error.message}`);
        }
    }

    async saveAs() {
        const file = this.currentFile && this.files[this.currentFile];
        if (!file) return;
        this.captureCurrentContent();
        if (!this.desktop) {
            if (window.androidApp) {
                this.requestMobileSave(this.currentFile, file, file.content, !file.isWorkspaceFile);
                return;
            }
            this.downloadFile(this.currentFile, file.content);
            return;
        }
        try {
            const result = await window.desktopApp.saveFileAs(file.content);
            if (!result) return;
            const name = this.uniqueName(result.name);
            this.files[name] = {
                name,
                content: file.content,
                loaded: true,
                dirty: false,
                isWorkspaceFile: false,
                token: result.token
            };
            this.saveFiles();
            this.updateTabs();
            this.renderFileTree();
            await this.switchFile(name);
            this.setStatus('Saved');
            this.notify(`Saved ${result.name}`);
        } catch (error) {
            this.notify(`Could not save file: ${error.message}`);
        }
    }

    requestMobileSave(fileName, file, content, markClean) {
        const requestId = ++this.mobileSaveSequence;
        this.pendingMobileSaves.set(requestId, { fileName, content, markClean });
        this.setStatus('Choose a save location');
        window.androidApp.saveTextFile(fileName, content, requestId);
    }

    handleMobileSaveResult(requestId, saved) {
        const pending = this.pendingMobileSaves.get(requestId);
        if (!pending) return;
        this.pendingMobileSaves.delete(requestId);
        const file = this.files[pending.fileName];
        if (saved && pending.markClean && file && file.content === pending.content) {
            file.dirty = false;
            this.saveFiles();
            this.updateTabs();
            this.setStatus('Saved');
            this.notify(`Saved ${pending.fileName}`);
        } else if (saved) {
            this.setStatus('Saved a copy; workspace changes remain unsaved');
            this.notify('Saved a copy. The workspace file still needs saving.');
        } else {
            this.setStatus('Save canceled or failed', true);
            this.notify('Save canceled or failed; your draft is still available.');
        }
    }

    downloadFile(name, content) {
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = name.split('/').pop() || 'untitled.txt';
        link.click();
        URL.revokeObjectURL(url);
    }
}

const fileManager = new FileManager();
