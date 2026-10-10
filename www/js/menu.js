class AppMenu {
    constructor() {
        this.currentAction = null;
        this.init();
    }

    init() {
        this.bindDropdowns();
        this.bindActions();
    }

    bindDropdowns() {
        document.querySelectorAll('.dropdown').forEach((dropdown) => {
            const button = dropdown.querySelector('.menu-button');
            if (!button) return;

            button.addEventListener('click', (event) => {
                event.stopPropagation();
                const isOpen = dropdown.classList.contains('open');
                document.querySelectorAll('.dropdown').forEach((item) => item.classList.remove('open'));
                if (!isOpen) dropdown.classList.add('open');
            });
        });

        document.addEventListener('click', () => {
            document.querySelectorAll('.dropdown').forEach((item) => item.classList.remove('open'));
        });
    }

    bindActions() {
        document.querySelectorAll('[data-action]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                this.handleAction(action);
                document.querySelectorAll('.dropdown').forEach((item) => item.classList.remove('open'));
            });
        });
    }

    handleAction(action) {
        const editor = document.getElementById('codeEditor');
        const terminal = document.getElementById('terminalInput');

        switch (action) {
            case 'new-file':
                if (window.fileManager) window.fileManager.createNewFile();
                break;
            case 'open-file':
                if (window.fileManager) {
                    const fileName = prompt('Enter file name:');
                    if (fileName) {
                        if (!window.fileManager.files[fileName]) {
                            window.fileManager.files[fileName] = { name: fileName, content: '', type: 'text' };
                            window.fileManager.saveFiles();
                        }
                        window.fileManager.switchFile(fileName);
                    }
                }
                break;
            case 'save-file':
                if (window.fileManager) window.fileManager.saveCurrentFile();
                break;
            case 'save-as':
                if (window.fileManager) {
                    const newName = prompt('Save as:');
                    if (newName) {
                        const current = window.fileManager.currentFile;
                        const active = editor ? editor.value : '';
                        window.fileManager.files[newName] = { name: newName, content: active, type: 'text' };
                        window.fileManager.currentFile = newName;
                        window.fileManager.saveFiles();
                        window.fileManager.updateEditor();
                        window.fileManager.updateTabs();
                        window.fileManager.renderFileTree();
                    }
                }
                break;
            case 'toggle-sidebar':
                document.querySelector('.sidebar')?.classList.toggle('collapsed');
                break;
            case 'toggle-terminal':
                document.querySelector('.terminal-panel')?.classList.toggle('collapsed');
                break;
            case 'copy':
                if (editor) editor.select();
                document.execCommand('copy');
                break;
            case 'paste':
                if (editor) {
                    editor.focus();
                    document.execCommand('paste');
                }
                break;
            case 'focus-editor':
                editor?.focus();
                break;
            case 'focus-terminal':
                terminal?.focus();
                break;
            case 'toggle-theme-panel':
                document.querySelector('.settings-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                break;
            case 'run-file':
                if (window.fileManager && window.fileManager.currentFile) {
                    const file = window.fileManager.currentFile;
                    const ext = file.split('.').pop()?.toLowerCase();
                    const runText = `Run command for ${file}: ${ext === 'py' ? 'python3 ' + file : 'node ' + file}`;
                    console.log(runText);
                    if (window.editorInstance && typeof window.editorInstance.processTerminalCommand === 'function') {
                        window.editorInstance.processTerminalCommand(`run ${file}`);
                    }
                }
                break;
            case 'run-terminal':
                document.querySelector('.terminal-panel')?.classList.remove('collapsed');
                terminal?.focus();
                break;
            case 'help-commands':
                if (window.editorInstance && typeof window.editorInstance.processTerminalCommand === 'function') {
                    window.editorInstance.processTerminalCommand('help');
                }
                break;
            case 'about':
                alert('Nightmare Designs Code\n\nDark editor shell with Matrix visual theme.');
                break;
            default:
                break;
        }
    }
}

new AppMenu();
