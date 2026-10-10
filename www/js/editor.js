// Initialize Editor
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
        this.setupUIEvents();
        this.setupKeyboardShortcuts();
        this.updateInitialState();
    }

    setupUIEvents() {
        // Sidebar toggle
        const toggleSidebarBtn = document.getElementById('toggleSidebar');
        const sidebar = document.querySelector('.sidebar');
        if (toggleSidebarBtn && sidebar) {
            toggleSidebarBtn.addEventListener('click', () => {
                sidebar.classList.toggle('collapsed');
            });
        }

        // Terminal toggle
        const toggleTerminalBtn = document.getElementById('toggleTerminal');
        const terminalPanel = document.querySelector('.terminal-panel');
        if (toggleTerminalBtn && terminalPanel) {
            toggleTerminalBtn.addEventListener('click', () => {
                terminalPanel.classList.toggle('collapsed');
            });
        }

        // Terminal input
        const terminalInput = document.getElementById('terminalInput');
        if (terminalInput) {
            terminalInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const command = e.target.value;
                    this.processTerminalCommand(command);
                    e.target.value = '';
                    e.preventDefault();
                }
            });
        }

        // Code editor
        const editor = document.getElementById('codeEditor');
        if (editor) {
            editor.addEventListener('keydown', (e) => this.handleEditorKeydown(e));
        }
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key.toLowerCase()) {
                    case 's':
                        e.preventDefault();
                        this.saveFile();
                        break;
                    case 'n':
                        e.preventDefault();
                        if (window.fileManager) fileManager.createNewFile();
                        break;
                    case 'o':
                        e.preventDefault();
                        this.openFileDialog();
                        break;
                }
            }
        });
    }

    handleEditorKeydown(e) {
        const editor = e.target;

        // Tab support
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = editor.selectionStart;
            const end = editor.selectionEnd;
            editor.value = editor.value.substring(0, start) + '\t' + editor.value.substring(end);
            editor.selectionStart = editor.selectionEnd = start + 1;

            // keep file state in sync
            if (window.fileManager && fileManager.currentFile && fileManager.files[fileManager.currentFile]) {
                fileManager.files[fileManager.currentFile].content = editor.value;
            }
        }
    }

    saveFile() {
        if (window.appMenu) {
            window.appMenu.saveFile();
            return;
        }
        if (!window.fileManager) return;
        fileManager.saveCurrentFile();
        this.showNotification('File saved: ' + fileManager.currentFile);
    }

    openFileDialog() {
        if (window.appMenu) {
            window.appMenu.openFile();
            return;
        }
        if (!window.fileManager) return;
        const fileName = prompt('Enter file name:');
        if (fileName) {
            if (!fileManager.files[fileName]) {
                fileManager.files[fileName] = { name: fileName, content: '', type: 'text' };
                fileManager.saveFiles();
            }
            fileManager.switchFile(fileName);
        }
    }

    processTerminalCommand(command) {
        const terminal = document.getElementById('terminal');
        if (!terminal) return;

        const normalized = (command || '').trim();
        if (!normalized) return;

        const line = document.createElement('div');
        line.className = 'terminal-line';
        const prompt = document.createElement('span');
        prompt.className = 'prompt';
        prompt.textContent = '$';
        line.append(prompt, document.createTextNode(` ${normalized}`));
        terminal.appendChild(line);

        const args = normalized.split(' ');
        const cmd = args[0].toLowerCase();

        let response;

        switch (cmd) {
            case 'help':
                response = [
                    'Available commands:',
                    '- help                Show this help',
                    '- clear               Clear terminal',
                    '- ls                  List files',
                    '- cat <file>          Show file content',
                    '- lang                Show supported languages',
                    '- run                 Show run command for current file',
                    '- run <file>          Show run command for a file',
                    '- echo <text>         Print text',
                    '- pwd                 Show pseudo working directory',
                    '- date                Show current date/time'
                ].join('\n');
                break;

            case 'clear':
                terminal.innerHTML = '<div class="terminal-line"><span class="prompt">$</span> Terminal cleared</div>';
                terminal.scrollTop = terminal.scrollHeight;
                return;

            case 'ls': {
                const files = window.fileManager ? Object.keys(fileManager.files) : ['untitled.txt'];
                response = files.join('  ');
                break;
            }

            case 'cat': {
                const target = args.slice(1).join(' ').trim();
                if (!target) {
                    response = 'Usage: cat <file>';
                } else if (window.fileManager && fileManager.files[target]) {
                    response = fileManager.files[target].content || '(empty file)';
                } else {
                    response = `File not found: ${target}`;
                }
                break;
            }

            case 'lang': {
                response = 'Supported languages: ' + Object.values(this.supportedLanguages).map(v => v.name).join(', ');
                break;
            }

            case 'run': {
                const maybeFile = args.slice(1).join(' ').trim();
                const targetFile = maybeFile || (window.fileManager ? fileManager.currentFile : null);

                if (!targetFile) {
                    response = 'No active file selected.';
                    break;
                }

                const ext = targetFile.includes('.') ? targetFile.split('.').pop().toLowerCase() : '';
                const lang = this.supportedLanguages[ext];

                if (!lang) {
                    response = `No runner mapped for .${ext || '(none)'}`;
                    break;
                }

                let runCmd = lang.run.replace('{file}', targetFile);
                if (ext === 'java') {
                    const mainClass = targetFile.replace(/\.java$/i, '');
                    runCmd = runCmd.replace('{mainClass}', mainClass);
                }

                response = `Language: ${lang.name}\nSuggested run: ${runCmd}`;
                break;
            }

            case 'echo':
                response = normalized.replace(/^echo\s*/i, '') || '';
                break;

            case 'pwd':
                response = '/nightmare-code';
                break;

            case 'date':
                response = new Date().toString();
                break;

            default:
                response = `Command not found: ${normalized}`;
                break;
        }

        const responseLine = document.createElement('div');
        responseLine.className = 'terminal-line';
        responseLine.textContent = response;
        terminal.appendChild(responseLine);

        terminal.scrollTop = terminal.scrollHeight;
    }

    showNotification(message) {
        let notification = document.getElementById('appNotification');
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'appNotification';
            notification.className = 'app-notification';
            notification.setAttribute('role', 'status');
            document.body.appendChild(notification);
        }

        notification.textContent = message;
        notification.classList.add('visible');
        clearTimeout(this.notificationTimeout);
        this.notificationTimeout = setTimeout(() => notification.classList.remove('visible'), 2400);
    }

    updateInitialState() {
        if (!window.fileManager) return;
        fileManager.updateEditor();
        fileManager.updateLineNumbers();
        fileManager.updateStatusBar();
        fileManager.updateTabs();
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.editorInstance = new NightmareCodeEditor();
    });
} else {
    window.editorInstance = new NightmareCodeEditor();
}
