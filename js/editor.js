class NightmareCodeEditor {
    constructor() {
        this.supportedLanguages = {
            js: { name: 'JavaScript', run: 'node {file}' },
            ts: { name: 'TypeScript', run: 'ts-node {file}' },
            py: { name: 'Python', run: 'python3 {file}' },
            java: { name: 'Java', run: 'javac {file} && java {mainClass}' },
            cs: { name: 'C#', run: 'dotnet run' },
            cpp: { name: 'C++', run: 'g++ {file} -o app && ./app' },
            c: { name: 'C', run: 'gcc {file} -o app && ./app' },
            go: { name: 'Go', run: 'go run {file}' },
            rs: { name: 'Rust', run: 'cargo run' },
            php: { name: 'PHP', run: 'php {file}' },
            html: { name: 'HTML', run: 'open {file} (or use browser preview)' }
        };
        this.init();
    }

    init() {
        document.getElementById('toggleSidebar')?.addEventListener('click', () => {
            document.querySelector('.sidebar')?.classList.toggle('collapsed');
        });
        document.getElementById('toggleTerminal')?.addEventListener('click', () => {
            document.querySelector('.terminal-panel')?.classList.toggle('collapsed');
        });
        document.getElementById('terminalInput')?.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            this.processTerminalCommand(event.currentTarget.value);
            event.currentTarget.value = '';
            event.preventDefault();
        });
        document.getElementById('browserFileInput')?.addEventListener('change', (event) => this.openBrowserFile(event));
        document.addEventListener('keydown', (event) => this.handleShortcuts(event));
        window.editorInstance = this;
    }

    handleShortcuts(event) {
        const editor = document.getElementById('codeEditor');
        if ((event.ctrlKey || event.metaKey) && !event.altKey) {
            switch (event.key.toLowerCase()) {
                case 's':
                    event.preventDefault();
                    window.fileManager?.saveCurrentFile();
                    break;
                case 'n':
                    event.preventDefault();
                    window.fileManager?.createNewFile();
                    break;
                case 'o':
                    event.preventDefault();
                    window.fileManager?.openFile();
                    break;
            }
        }
        if (event.key === 'Tab' && event.target === editor) {
            event.preventDefault();
            const start = editor.selectionStart;
            const end = editor.selectionEnd;
            editor.setRangeText('    ', start, end, 'end');
            editor.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    async openBrowserFile(event) {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (!file || !window.fileManager) return;
        try {
            const content = await file.text();
            const name = window.fileManager.uniqueName(file.name);
            window.fileManager.files[name] = { name, content, loaded: true, dirty: false, isWorkspaceFile: false };
            window.fileManager.switchFile(name);
        } catch (error) {
            this.showNotification(`Could not open file: ${error.message}`);
        }
    }

    processTerminalCommand(command) {
        const terminal = document.getElementById('terminal');
        if (!terminal) return;
        const normalized = (command || '').trim();
        if (!normalized) return;

        const inputLine = document.createElement('div');
        inputLine.className = 'terminal-line';
        const prompt = document.createElement('span');
        prompt.className = 'prompt';
        prompt.textContent = '$ ';
        inputLine.append(prompt, document.createTextNode(normalized));
        terminal.appendChild(inputLine);

        const [cmd, ...rest] = normalized.split(/\s+/);
        const argument = normalized.slice(cmd.length).trim();
        let response;
        switch (cmd.toLowerCase()) {
            case 'help':
                response = [
                    'Safe demo commands (no system commands are executed):',
                    'help · clear · ls · cat <file> · lang · build [file|workspace] · run [file] · echo <text> · pwd · date'
                ].join('\n');
                break;
            case 'clear':
                terminal.replaceChildren();
                terminal.scrollTop = terminal.scrollHeight;
                return;
            case 'ls':
                response = window.fileManager ? Object.keys(window.fileManager.files).join('  ') : 'No open files.';
                break;
            case 'cat':
                response = argument && window.fileManager?.files[argument]
                    ? (window.fileManager.files[argument].content || '(empty file)')
                    : `File not found: ${argument || '(provide a file name)'}`;
                break;
            case 'lang':
                response = `Suggested runners: ${Object.values(this.supportedLanguages).map((language) => language.name).join(', ')}`;
                break;
            case 'run': {
                const fileName = argument || window.fileManager?.currentFile;
                const ext = fileName?.split('.').pop().toLowerCase();
                const language = this.supportedLanguages[ext];
                response = language
                    ? `Demo only — no code was run.\nLanguage: ${language.name}\nSuggested command: ${language.run.replace('{file}', fileName).replace('{mainClass}', fileName.replace(/\.java$/i, ''))}`
                    : `No suggested runner for ${fileName || 'the current file'}. Nothing was executed.`;
                break;
            }
            case 'build': {
                const target = argument || window.fileManager?.currentFile || 'workspace';
                const ext = target === 'workspace' ? '' : target.split('.').pop().toLowerCase();
                const language = this.supportedLanguages[ext];
                response = `Demo only — no build was started.\n${language
                    ? `${language.name} build tools must be installed and explicitly authorized before they can run.`
                    : `Configure a project build tool for ${target} before building.`}`;
                break;
            }
            case 'echo':
                response = rest.length ? normalized.slice(cmd.length).trimStart() : '';
                break;
            case 'pwd':
                response = window.fileManager?.workspaceName || '/nightmare-code (demo)';
                break;
            case 'date':
                response = new Date().toString();
                break;
            default:
                response = `Command not found: ${normalized}`;
        }

        const responseLine = document.createElement('div');
        responseLine.className = 'terminal-line';
        responseLine.textContent = response;
        terminal.appendChild(responseLine);
        terminal.scrollTop = terminal.scrollHeight;
    }

    showNotification(message) {
        window.fileManager?.notify(message);
    }
}

new NightmareCodeEditor();
