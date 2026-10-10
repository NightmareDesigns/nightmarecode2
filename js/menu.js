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
        const manager = window.fileManager;

        switch (action) {
            case 'new-file':
                manager?.createNewFile();
                break;
            case 'open-file':
                manager?.openFile();
                break;
            case 'open-workspace':
                manager?.openWorkspace();
                break;
            case 'save-file':
                manager?.saveCurrentFile();
                break;
            case 'save-as':
                manager?.saveAs();
                break;
            case 'undo':
                editor?.focus();
                document.execCommand('undo');
                break;
            case 'redo':
                editor?.focus();
                document.execCommand('redo');
                break;
            case 'cut':
                editor?.focus();
                document.execCommand('cut');
                break;
            case 'select-all':
                editor?.focus();
                editor?.select();
                break;
            case 'toggle-sidebar':
                document.querySelector('.sidebar')?.classList.toggle('collapsed');
                break;
            case 'toggle-terminal':
                document.querySelector('.terminal-panel')?.classList.toggle('collapsed');
                break;
            case 'copy':
                editor?.focus();
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
            case 'toggle-glasses-mode':
                window.editorInstance?.toggleGlassesMode();
                break;
            case 'toggle-theme-panel':
                document.querySelector('.settings-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                break;
            case 'run-file':
                this.runDemoCommand(`run ${manager?.currentFile || ''}`);
                break;
            case 'build-file':
                this.runDemoCommand(`build ${manager?.currentFile || ''}`.trim());
                break;
            case 'build-workspace':
                this.runDemoCommand('build workspace');
                break;
            case 'voice-dictation':
                window.editorInstance?.toggleVoice('dictation');
                break;
            case 'voice-commands':
                window.editorInstance?.toggleVoice('commands');
                break;
            case 'voice-read':
                window.editorInstance?.readCurrentFileAloud();
                break;
            case 'voice-stop':
                window.editorInstance?.stopVoiceRecognition();
                window.editorInstance?.stopSpeaking();
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

    runDemoCommand(command) {
        document.querySelector('.terminal-panel')?.classList.remove('collapsed');
        if (window.editorInstance && typeof window.editorInstance.processTerminalCommand === 'function') {
            window.editorInstance.processTerminalCommand(command);
        }
    }
}

new AppMenu();
