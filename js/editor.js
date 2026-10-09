// Initialize Editor
class NightmareCodeEditor {
    constructor() {
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
        toggleSidebarBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
        });

        // Terminal toggle
        const toggleTerminalBtn = document.getElementById('toggleTerminal');
        const terminalPanel = document.querySelector('.terminal-panel');
        toggleTerminalBtn.addEventListener('click', () => {
            terminalPanel.classList.toggle('collapsed');
        });

        // Terminal input
        const terminalInput = document.getElementById('terminalInput');
        terminalInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.processTerminalCommand(e.target.value);
                e.target.value = '';
            }
        });

        // Code editor
        const editor = document.getElementById('codeEditor');
        editor.addEventListener('keydown', (e) => this.handleEditorKeydown(e));
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 's':
                        e.preventDefault();
                        this.saveFile();
                        break;
                    case 'n':
                        e.preventDefault();
                        fileManager.createNewFile();
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
        }
    }

    saveFile() {
        fileManager.saveCurrentFile();
        this.showNotification('File saved: ' + fileManager.currentFile);
    }

    openFileDialog() {
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
        const line = document.createElement('div');
        line.className = 'terminal-line';
        line.innerHTML = `<span class="prompt">$</span> ${command}`;
        terminal.appendChild(line);

        // Demo responses
        const responses = {
            'help': 'Available commands: ls, echo, clear, help',
            'clear': 'CLEAR',
            'ls': 'untitled.txt  nightmare.js  style.css',
            'echo': `${command.replace('echo ', '')}`,
            'pwd': '/nightmare-code',
            'date': new Date().toString()
        };

        const cmd = command.trim().split(' ')[0];
        const response = responses[cmd] || `Command not found: ${command}`;

        if (response === 'CLEAR') {
            terminal.innerHTML = '<div class="terminal-line"><span class="prompt">$</span> Terminal cleared</div>';
        } else {
            const responseLine = document.createElement('div');
            responseLine.className = 'terminal-line';
            responseLine.textContent = response;
            terminal.appendChild(responseLine);
        }

        terminal.scrollTop = terminal.scrollHeight;
    }

    showNotification(message) {
        console.log('🩸 Nightmare Code: ' + message);
    }

    updateInitialState() {
        fileManager.updateEditor();
        fileManager.updateLineNumbers();
        fileManager.updateStatusBar();
        fileManager.updateTabs();
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new NightmareCodeEditor();
    });
} else {
    new NightmareCodeEditor();
}