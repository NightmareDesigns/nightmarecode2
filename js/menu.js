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
                window.editorInstance?.showToolsView('terminal');
                document.querySelector('.terminal-panel')?.classList.remove('collapsed');
                break;
            case 'toggle-glasses-mode':
                window.editorInstance?.toggleGlassesMode();
                break;
            case 'toggle-theme-panel':
                document.querySelector('.sidebar')?.classList.remove('collapsed');
                const settingsPanel = document.getElementById('settingsPanel');
                if (settingsPanel) {
                    settingsPanel.open = true;
                    settingsPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
                break;
            case 'focus-search':
                document.querySelector('.sidebar')?.classList.remove('collapsed');
                document.getElementById('searchFiles')?.focus();
                break;
            case 'run-file':
                this.runWorkspaceAction(`run ${manager?.currentFile || ''}`);
                break;
            case 'build-file':
                this.runWorkspaceAction(`build ${manager?.currentFile || ''}`.trim());
                break;
            case 'decompile-file':
                window.editorInstance?.decompileCurrentFile();
                break;
            case 'toggle-ai':
                window.editorInstance?.showToolsView('ai');
                document.querySelector('.terminal-panel')?.classList.remove('collapsed');
                break;
            case 'ai-apply':
                window.editorInstance?.applyAIResponse(true);
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
                window.editorInstance?.showToolsView('terminal');
                break;
            case 'help-commands':
                window.fileManager?.notify('Build/Run supports .js and .py; Decompile supports .exe, .dll, .class, .jar, and .wasm in Windows/Linux desktop.');
                break;
            case 'about':
                alert('Nightmare Designs Code\n\nDark editor shell with Matrix visual theme.');
                break;
            default:
                break;
        }
    }

    runWorkspaceAction(command) {
        document.querySelector('.terminal-panel')?.classList.remove('collapsed');
        if (window.editorInstance && typeof window.editorInstance.processTerminalCommand === 'function') {
            window.editorInstance.processTerminalCommand(command);
        }
    }
}

new AppMenu();
