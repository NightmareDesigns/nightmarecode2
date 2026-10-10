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
        this.voiceRecognition = null;
        this.voiceMode = null;
        this.voiceStopRequested = false;
        this.voicePrivacyNotified = false;
        this.glassesModeManuallySet = false;
        this.externalDisplayActive = Boolean(window.androidApp?.isExternalDisplay());
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
        this.syncExternalDisplayMode(this.externalDisplayActive);
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

    toggleVoice(mode) {
        if (this.voiceMode === mode) {
            this.stopVoiceRecognition();
            return;
        }

        this.stopVoiceRecognition();
        const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!Recognition) {
            this.showNotification('Speech recognition is not available on this platform.');
            return;
        }

        const recognition = new Recognition();
        this.voiceRecognition = recognition;
        this.voiceMode = mode;
        this.voiceStopRequested = false;
        recognition.lang = navigator.language || 'en-US';
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.onstart = () => this.setVoiceStatus(mode === 'dictation' ? 'Dictation on' : 'Voice commands on');
        recognition.onresult = (event) => {
            for (let index = event.resultIndex; index < event.results.length; index++) {
                if (!event.results[index].isFinal) continue;
                const transcript = event.results[index][0].transcript.trim();
                if (mode === 'dictation') this.insertDictation(transcript);
                else this.runVoiceCommand(transcript);
            }
        };
        recognition.onerror = (event) => {
            if (event.error !== 'no-speech' && event.error !== 'aborted') {
                this.showNotification(`Speech recognition failed: ${event.error}`);
            }
            if (event.error !== 'no-speech') this.stopVoiceRecognition();
        };
        recognition.onend = () => {
            if (this.voiceRecognition !== recognition || this.voiceStopRequested) return;
            if (!this.voiceMode) return;
            setTimeout(() => {
                if (this.voiceRecognition !== recognition || this.voiceStopRequested) return;
                try {
                    recognition.start();
                } catch {
                    this.stopVoiceRecognition();
                }
            }, 250);
        };

        if (!this.voicePrivacyNotified) {
            this.voicePrivacyNotified = true;
            this.showNotification('Speech recognition may send audio to your browser’s speech provider; read-aloud uses device voices.');
        }
        this.setVoiceStatus(mode === 'dictation' ? 'Starting dictation…' : 'Starting commands…');
        try {
            recognition.start();
        } catch (error) {
            this.stopVoiceRecognition();
            this.showNotification(`Could not start speech recognition: ${error.message}`);
        }
    }

    stopVoiceRecognition() {
        this.voiceStopRequested = true;
        const recognition = this.voiceRecognition;
        this.voiceRecognition = null;
        this.voiceMode = null;
        if (recognition) {
            recognition.onend = null;
            try {
                recognition.stop();
            } catch {
                try {
                    recognition.abort();
                } catch {
                    // The browser may already have stopped this recognition session.
                }
            }
        }
        this.setVoiceStatus('Voice off');
    }

    setVoiceStatus(message) {
        const status = document.getElementById('voiceStatus');
        if (status) status.textContent = message;
    }

    insertDictation(transcript) {
        const editor = document.getElementById('codeEditor');
        if (!editor || !transcript) return;
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        const before = editor.value.slice(0, start);
        const after = editor.value.slice(end);
        const spacingBefore = before && !/\s$/.test(before) ? ' ' : '';
        const spacingAfter = after && !/^\s/.test(after) ? ' ' : '';
        editor.setRangeText(`${spacingBefore}${transcript}${spacingAfter}`, start, end, 'end');
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        editor.focus();
    }

    runVoiceCommand(transcript) {
        const command = transcript.toLowerCase().replace(/[.!?]+$/g, '').trim().replace(/\s+/g, ' ');
        const manager = window.fileManager;
        const terminalPanel = document.querySelector('.terminal-panel');
        const sidebar = document.querySelector('.sidebar');
        switch (command) {
            case 'new file':
                manager?.createNewFile();
                break;
            case 'open file':
                manager?.openFile();
                break;
            case 'open workspace':
                manager?.openWorkspace();
                break;
            case 'save':
            case 'save file':
                manager?.saveCurrentFile();
                break;
            case 'save as':
                manager?.saveAs();
                break;
            case 'show terminal':
            case 'open terminal':
            case 'toggle terminal':
                terminalPanel?.classList.remove('collapsed');
                document.getElementById('terminalInput')?.focus();
                break;
            case 'hide terminal':
                terminalPanel?.classList.add('collapsed');
                break;
            case 'show explorer':
            case 'toggle explorer':
                sidebar?.classList.remove('collapsed');
                break;
            case 'hide explorer':
                sidebar?.classList.add('collapsed');
                break;
            case 'build':
            case 'build file':
                this.processTerminalCommand(`build ${manager?.currentFile || ''}`);
                break;
            case 'build workspace':
                this.processTerminalCommand('build workspace');
                break;
            case 'run':
            case 'run file':
                this.processTerminalCommand(`run ${manager?.currentFile || ''}`);
                break;
            case 'read file':
            case 'read code':
            case 'read current file':
                this.readCurrentFileAloud();
                break;
            case 'stop speaking':
            case 'stop audio':
                this.stopSpeaking();
                break;
            case 'stop listening':
            case 'stop voice commands':
            case 'stop dictation':
                this.stopVoiceRecognition();
                break;
            case 'undo':
            case 'redo':
            case 'select all': {
                const editor = document.getElementById('codeEditor');
                editor?.focus();
                if (command === 'select all') editor?.select();
                else document.execCommand(command);
                break;
            }
            case 'dictation mode':
                this.toggleVoice('dictation');
                break;
            default:
                this.showNotification(`Voice command not recognized: ${transcript}`);
        }
    }

    readCurrentFileAloud() {
        if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
            this.showNotification('Read-aloud is not available on this platform.');
            return;
        }
        const editor = document.getElementById('codeEditor');
        if (!editor) return;
        const selection = editor.value.slice(editor.selectionStart, editor.selectionEnd);
        const text = (selection || editor.value).trim();
        if (!text) {
            this.showNotification('There is no code to read aloud.');
            return;
        }
        const utterance = new SpeechSynthesisUtterance(text.slice(0, 5000));
        utterance.lang = navigator.language || 'en-US';
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
        this.showNotification(text.length > 5000 ? 'Reading the first 5,000 characters aloud.' : 'Reading aloud.');
    }

    stopSpeaking() {
        if (window.speechSynthesis) window.speechSynthesis.cancel();
    }

    syncExternalDisplayMode(isExternalDisplay) {
        this.externalDisplayActive = Boolean(isExternalDisplay);
        if (!this.glassesModeManuallySet) this.applyGlassesMode(this.externalDisplayActive);
    }

    toggleGlassesMode() {
        this.glassesModeManuallySet = true;
        this.applyGlassesMode(!document.body.classList.contains('glasses-mode'));
    }

    applyGlassesMode(enabled) {
        document.body.classList.toggle('glasses-mode', enabled);
        const status = document.getElementById('displayModeStatus');
        if (status) {
            status.textContent = enabled
                ? (this.externalDisplayActive ? 'External display mode' : 'Glasses mode')
                : 'Standard display';
        }
    }

    showNotification(message) {
        window.fileManager?.notify(message);
    }
}

new NightmareCodeEditor();
