class AppMenu {
    constructor() {
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
                document.querySelectorAll('.dropdown').forEach((item) => {
                    item.classList.remove('open');
                    item.querySelector('.menu-button')?.setAttribute('aria-expanded', 'false');
                });
                if (!isOpen) {
                    dropdown.classList.add('open');
                    button.setAttribute('aria-expanded', 'true');
                }
            });
        });

        const closeMenus = () => {
            document.querySelectorAll('.dropdown').forEach((item) => {
                item.classList.remove('open');
                item.querySelector('.menu-button')?.setAttribute('aria-expanded', 'false');
            });
        };
        document.addEventListener('click', closeMenus);
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closeMenus();
        });
    }

    bindActions() {
        document.querySelectorAll('[data-action]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                this.handleAction(action);
                document.querySelectorAll('.dropdown').forEach((item) => {
                    item.classList.remove('open');
                    item.querySelector('.menu-button')?.setAttribute('aria-expanded', 'false');
                });
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
                this.runEditorCommand(editor, 'undo');
                break;
            case 'redo':
                this.runEditorCommand(editor, 'redo');
                break;
            case 'cut':
                this.runEditorCommand(editor, 'cut', true);
                break;
            case 'select-all':
                editor?.focus();
                editor?.select();
                break;
            case 'toggle-sidebar':
                this.toggleSidebar();
                break;
            case 'toggle-terminal':
                window.editorInstance?.toggleTerminalPanel();
                break;
            case 'toggle-extensions':
                this.toggleExtensions();
                break;
            case 'copy':
                this.runEditorCommand(editor, 'copy', true);
                break;
            case 'paste':
                void this.pasteIntoEditor(editor);
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
                this.openSidebar();
                const settingsPanel = document.getElementById('settingsPanel');
                if (settingsPanel) {
                    settingsPanel.open = true;
                    settingsPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
                break;
            case 'focus-search':
                this.openSidebar();
                this.setExplorerMode(true);
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
                window.editorInstance?.showToolsView('terminal');
                document.querySelector('.terminal-panel')?.classList.remove('collapsed');
                break;
            case 'about':
                this.showInfo(
                    'About Nightmare Code',
                    'Nightmare Code is a desktop and browser code editor with workspace browsing, syntax highlighting, desktop build/run and decompilation tools, optional local dictation, local snippet packs, and reviewable AI assistance.'
                );
                break;
            case 'help-commands':
                this.showInfo(
                    'Help and shortcuts',
                    'File: Ctrl+N new file, Ctrl+O open file, Ctrl+S save.\nExplorer search filters workspace paths; click folders to expand or collapse them.\nBuild/Run supports JavaScript and Python in the desktop app. Decompile supports PE, Java bytecode/JAR, and WebAssembly on x64 Windows/Linux.\nExtensions imports local JSON snippet packs; pack code is never executed.\nThe unrestricted terminal is available only in supported desktop builds after opening a workspace and confirming its warning.'
                );
                break;
            default:
                window.fileManager?.notify(`This menu action is not available: ${action}`);
                break;
        }
    }

    toggleSidebar() {
        const sidebar = document.querySelector('.sidebar');
        sidebar?.classList.toggle('collapsed');
        const isOpen = !sidebar?.classList.contains('collapsed');
        document.querySelectorAll('.activity-bar [data-action="toggle-sidebar"], #toggleSidebar').forEach((button) => {
            button.classList.toggle('active', isOpen);
            button.setAttribute('aria-pressed', String(isOpen));
        });
        this.setExplorerMode(isOpen ? false : null);
    }

    openSidebar() {
        const sidebar = document.querySelector('.sidebar');
        sidebar?.classList.remove('collapsed');
        document.querySelectorAll('.activity-bar [data-action="toggle-sidebar"], #toggleSidebar').forEach((button) => {
            button.classList.add('active');
            button.setAttribute('aria-pressed', 'true');
        });
        this.setExplorerMode(false);
    }

    setExplorerMode(searchActive) {
        document.querySelectorAll('.activity-bar [data-action="toggle-sidebar"], .activity-bar [data-action="focus-search"]').forEach((button) => {
            const active = searchActive !== null && button.dataset.action === (searchActive ? 'focus-search' : 'toggle-sidebar');
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
        });
    }

    runEditorCommand(editor, command, selectionRequired = false) {
        if (!editor) return;
        if (selectionRequired && editor.selectionStart === editor.selectionEnd) {
            window.fileManager?.notify(`Select text before using ${command}.`);
            return;
        }
        editor.focus();
        const succeeded = document.execCommand(command);
        if (!succeeded) window.fileManager?.notify(`${command} is not available here.`);
    }

    async pasteIntoEditor(editor) {
        if (!editor) return;
        editor.focus();
        try {
            const text = await navigator.clipboard.readText();
            const start = editor.selectionStart;
            const end = editor.selectionEnd;
            editor.setRangeText(text, start, end, 'end');
            editor.dispatchEvent(new Event('input', { bubbles: true }));
        } catch {
            window.fileManager?.notify('Clipboard access was denied or is unavailable in this browser.');
        }
    }

    toggleExtensions() {
        const panel = document.getElementById('extensionsPanel');
        if (!panel) return;
        panel.hidden = !panel.hidden;
        document.querySelectorAll('.right-activity-bar [data-action="toggle-extensions"]').forEach((button) => {
            button.classList.toggle('active', !panel.hidden);
            button.setAttribute('aria-pressed', String(!panel.hidden));
        });
    }

    showInfo(title, message) {
        const dialog = document.getElementById('infoDialog');
        const heading = document.getElementById('infoDialogTitle');
        const content = document.getElementById('infoDialogContent');
        if (!dialog || !heading || !content) return;
        heading.textContent = title;
        content.textContent = message;
        if (!dialog.open) dialog.showModal();
    }

    runWorkspaceAction(command) {
        document.querySelector('.terminal-panel')?.classList.remove('collapsed');
        if (window.editorInstance && typeof window.editorInstance.processTerminalCommand === 'function') {
            window.editorInstance.processTerminalCommand(command);
        }
    }
}

new AppMenu();
