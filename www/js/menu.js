class AppMenu {
    constructor() {
        this.init();
    }

    init() {
        window.appMenu = this;
        this.bindDropdowns();
        this.bindActions();
        this.bindFilePicker();
    }

    closeDropdowns() {
        document.querySelectorAll('.dropdown.open').forEach((dropdown) => {
            dropdown.classList.remove('open');
            dropdown.querySelector('.menu-button')?.setAttribute('aria-expanded', 'false');
        });
    }

    bindDropdowns() {
        document.querySelectorAll('.dropdown').forEach((dropdown) => {
            const button = dropdown.querySelector('.menu-button');
            const menu = dropdown.querySelector('.dropdown-menu');
            if (!button || !menu) return;

            const menuId = menu.id || `menu-${button.textContent.trim().toLowerCase()}`;
            menu.id = menuId;
            button.setAttribute('aria-haspopup', 'true');
            button.setAttribute('aria-controls', menuId);
            button.setAttribute('aria-expanded', 'false');

            button.addEventListener('click', (event) => {
                event.stopPropagation();
                const shouldOpen = !dropdown.classList.contains('open');
                this.closeDropdowns();
                if (shouldOpen) {
                    dropdown.classList.add('open');
                    button.setAttribute('aria-expanded', 'true');
                }
            });

            button.addEventListener('keydown', (event) => {
                if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    dropdown.classList.add('open');
                    button.setAttribute('aria-expanded', 'true');
                    menu.querySelector('button')?.focus();
                }
            });

            menu.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    this.closeDropdowns();
                    button.focus();
                }
            });
        });

        document.addEventListener('click', (event) => {
            if (!event.target.closest('.dropdown')) this.closeDropdowns();
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') this.closeDropdowns();
        });
    }

    bindActions() {
        document.querySelectorAll('[data-action]').forEach((button) => {
            button.addEventListener('click', async () => {
                const action = button.dataset.action;
                this.closeDropdowns();
                try {
                    await this.handleAction(action);
                } catch (error) {
                    this.notify(`Could not ${action.replaceAll('-', ' ')}: ${error.message}`);
                }
            });
        });
    }

    bindFilePicker() {
        const input = document.getElementById('openFileInput');
        if (!input) return;
        input.addEventListener('change', async () => {
            const [file] = input.files || [];
            if (file && window.fileManager) await window.fileManager.importFile(file);
            input.value = '';
        });
    }

    async openFile() {
        if (!window.fileManager) return;
        if (window.desktopApp?.openFile) {
            const file = await window.desktopApp.openFile();
            if (file) window.fileManager.openFileContent(file.name, file.content, file.id);
            return;
        }

        document.getElementById('openFileInput')?.click();
    }

    async saveFile(saveAs = false) {
        const manager = window.fileManager;
        if (!manager?.currentFile) {
            this.notify('Create or open a file before saving.');
            return;
        }

        const currentName = manager.currentFile;
        const content = manager.getCurrentContent();
        let result;

        if (window.desktopApp?.saveFile) {
            result = await window.desktopApp.saveFile({
                id: saveAs ? null : manager.fileHandles.get(currentName),
                name: currentName,
                content,
                saveAs
            });
            if (!result) return;
            manager.openFileContent(result.name, content, result.id);
        } else if (saveAs) {
            const requestedName = prompt('Save file as:', currentName);
            if (requestedName === null) return;
            const newName = requestedName.trim();
            if (!newName) {
                this.notify('Enter a file name.');
                return;
            }
            if (newName !== currentName && Object.prototype.hasOwnProperty.call(manager.files, newName)
                && !confirm(`Replace ${newName}?`)) return;

            manager.downloadFile(newName, content);
            manager.openFileContent(newName, content);
        } else {
            manager.downloadFile(currentName, content);
        }

        this.notify(`Saved ${manager.currentFile}.`);
    }

    async useClipboard(action) {
        const editor = document.getElementById('codeEditor');
        if (!editor) return;

        if (action === 'select-all') {
            editor.focus();
            editor.select();
            return;
        }

        if (action === 'undo' || action === 'redo') {
            editor.focus();
            document.execCommand(action);
            return;
        }

        if (action === 'cut' || action === 'copy') {
            const start = editor.selectionStart;
            const end = editor.selectionEnd;
            if (start === end) {
                this.notify(`Select text to ${action}.`);
                return;
            }

            const selection = editor.value.slice(start, end);
            if (window.desktopApp?.writeClipboard) {
                await window.desktopApp.writeClipboard(selection);
            } else {
                await navigator.clipboard.writeText(selection);
            }
            if (action === 'cut') {
                editor.setRangeText('', start, end, 'start');
                editor.dispatchEvent(new Event('input', { bubbles: true }));
            }
            return;
        }

        if (action === 'paste') {
            const text = window.desktopApp?.readClipboard
                ? await window.desktopApp.readClipboard()
                : await navigator.clipboard.readText();
            const start = editor.selectionStart;
            const end = editor.selectionEnd;
            editor.focus();
            editor.setRangeText(text, start, end, 'end');
            editor.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    notify(message) {
        if (window.editorInstance?.showNotification) {
            window.editorInstance.showNotification(message);
        } else {
            console.info(message);
        }
    }

    async handleAction(action) {
        const editor = document.getElementById('codeEditor');
        const terminal = document.getElementById('terminalInput');
        const fileManager = window.fileManager;

        switch (action) {
            case 'new-file':
                fileManager?.createNewFile();
                break;
            case 'open-file':
                await this.openFile();
                break;
            case 'save-file':
                await this.saveFile();
                break;
            case 'save-as':
                await this.saveFile(true);
                break;
            case 'cut':
            case 'copy':
            case 'paste':
            case 'undo':
            case 'redo':
            case 'select-all':
                await this.useClipboard(action);
                break;
            case 'toggle-sidebar':
                document.querySelector('.sidebar')?.classList.toggle('collapsed');
                break;
            case 'toggle-terminal':
                document.querySelector('.terminal-panel')?.classList.toggle('collapsed');
                break;
            case 'focus-editor':
                editor?.focus();
                break;
            case 'focus-terminal':
                document.querySelector('.terminal-panel')?.classList.remove('collapsed');
                terminal?.focus();
                break;
            case 'toggle-theme-panel': {
                const sidebar = document.querySelector('.sidebar');
                const settings = document.querySelector('.settings-panel');
                sidebar?.classList.remove('collapsed');
                settings?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                break;
            }
            case 'help-commands':
                document.querySelector('.terminal-panel')?.classList.remove('collapsed');
                window.editorInstance?.processTerminalCommand('help');
                document.getElementById('terminal')?.scrollTo({
                    top: document.getElementById('terminal').scrollHeight,
                    behavior: 'smooth'
                });
                break;
            case 'about':
                alert('Nightmare Designs Code\n\nA code editor with a Matrix visual theme.');
                break;
            default:
                throw new Error('This menu command is not available.');
        }
    }
}

new AppMenu();
