class NightmareCodeEditor {
    constructor() {
        this.voiceRecognition = null;
        this.voiceMode = null;
        this.voiceStopRequested = false;
        this.voicePrivacyNotified = false;
        this.glassesModeManuallySet = false;
        this.externalDisplayActive = false;
        this.processEventBuffer = new Map();
        this.processStartPending = false;
        this.init();
    }

    init() {
        document.getElementById('toggleSidebar')?.addEventListener('click', () => {
            document.querySelector('.sidebar')?.classList.toggle('collapsed');
        });
        document.getElementById('toggleTerminal')?.addEventListener('click', () => {
            document.querySelector('.terminal-panel')?.classList.toggle('collapsed');
        });
        document.getElementById('browserFileInput')?.addEventListener('change', (event) => this.openBrowserFile(event));
        document.getElementById('toolsTerminalTab')?.addEventListener('click', () => this.showToolsView('terminal'));
        document.getElementById('toolsAiTab')?.addEventListener('click', () => this.showToolsView('ai'));
        document.getElementById('aiSendBtn')?.addEventListener('click', () => this.askAI());
        document.getElementById('aiInsertBtn')?.addEventListener('click', () => this.applyAIResponse(false));
        document.getElementById('aiReplaceBtn')?.addEventListener('click', () => this.applyAIResponse(true));
        document.getElementById('stopProcessBtn')?.addEventListener('click', () => this.stopWorkspaceProcess());
        window.desktopApp?.onProcessOutput?.((result) => this.appendProcessOutput(result));
        window.desktopApp?.onProcessComplete?.((result) => this.finishWorkspaceProcess(result));
        document.addEventListener('keydown', (event) => this.handleShortcuts(event));
        window.addEventListener('resize', () => this.refreshExternalDisplayMode());
        window.editorInstance = this;
        window.desktopApp?.onDisplayInfo?.((displayInfo) => this.syncExternalDisplayMode(displayInfo.external));
        this.refreshExternalDisplayMode();
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

        const [cmd] = normalized.split(/\s+/);
        const argument = normalized.slice(cmd.length).trim();
        switch (cmd.toLowerCase()) {
            case 'clear':
                terminal.replaceChildren();
                terminal.scrollTop = terminal.scrollHeight;
                return;
            case 'run': {
                const fileName = argument || window.fileManager?.currentFile;
                this.executeWorkspaceAction('run', fileName);
                return;
            }
            case 'build': {
                this.executeWorkspaceAction('build', argument || window.fileManager?.currentFile);
                return;
            }
            default:
                this.appendTerminalMessage('Use Build or Run from the top menu. Arbitrary shell commands are not accepted.');
                return;
        }
    }

    showToolsView(view) {
        const showAI = view === 'ai';
        document.getElementById('terminalView').hidden = showAI;
        document.getElementById('aiView').hidden = !showAI;
        document.getElementById('toolsTerminalTab').classList.toggle('active-tool-tab', !showAI);
        document.getElementById('toolsAiTab').classList.toggle('active-tool-tab', showAI);
    }

    async executeWorkspaceAction(action, fileName) {
        const terminal = document.getElementById('terminal');
        this.showToolsView('terminal');
        document.querySelector('.terminal-panel')?.classList.remove('collapsed');
        if (!window.desktopApp?.startWorkspaceProcess) {
            this.appendTerminalMessage('Run/Build needs the desktop app and an open workspace. Browser and Android modes cannot execute code.');
            return;
        }
        if (!fileName || fileName === 'workspace') {
            this.appendTerminalMessage('Choose an open .js or .py workspace file.');
            return;
        }
        if (!/\.(js|py)$/i.test(fileName)) {
            this.appendTerminalMessage('Real Build/Run currently supports JavaScript (.js) and Python (.py) files only.');
            return;
        }
        if (window.fileManager?.files[fileName]?.dirty) {
            this.appendTerminalMessage('Save the current file before running or building it.');
            return;
        }
        if (this.activeProcessId || this.processStartPending) {
            this.appendTerminalMessage('A workspace process is already starting or running.');
            return;
        }
        const verb = action === 'run' ? 'Run' : 'Syntax-check';
        const approved = confirm(
            `${verb} ${fileName}?\n\nThis executes code or a compiler on your computer as your user. It is not sandboxed and may access files, the network, or start other processes. Continue only if you trust this project.`
        );
        if (!approved) {
            this.appendTerminalMessage(`${verb} canceled.`);
            return;
        }
        this.appendTerminalMessage(`$ ${action} ${fileName}`);
        const stopButton = document.getElementById('stopProcessBtn');
        if (stopButton) stopButton.hidden = false;
        this.processStartPending = true;
        try {
            const result = await window.desktopApp.startWorkspaceProcess({ action, file: fileName });
            this.activeProcessId = result.jobId;
            this.processStartPending = false;
            this.appendTerminalMessage(`Started: ${result.command}`);
            const bufferedEvents = this.processEventBuffer.get(result.jobId) || [];
            this.processEventBuffer.delete(result.jobId);
            for (const bufferedEvent of bufferedEvents) {
                if (bufferedEvent.type === 'output') this.appendProcessOutput(bufferedEvent.result);
                else this.finishWorkspaceProcess(bufferedEvent.result);
            }
        } catch (error) {
            this.processStartPending = false;
            if (stopButton) stopButton.hidden = true;
            this.appendTerminalMessage(`Could not start: ${error.message}`);
        }
        if (terminal) terminal.scrollTop = terminal.scrollHeight;
    }

    appendTerminalMessage(message) {
        const terminal = document.getElementById('terminal');
        if (!terminal) return;
        const line = document.createElement('div');
        line.className = 'terminal-line';
        line.textContent = message;
        terminal.appendChild(line);
        terminal.scrollTop = terminal.scrollHeight;
    }

    appendProcessOutput(result) {
        if (result.jobId !== this.activeProcessId) {
            if (!this.activeProcessId && this.processStartPending) this.bufferProcessEvent(result.jobId, 'output', result);
            return;
        }
        const terminal = document.getElementById('terminal');
        if (!terminal) return;
        const output = document.createElement('div');
        output.className = 'terminal-line';
        output.textContent = result.text;
        terminal.appendChild(output);
        terminal.scrollTop = terminal.scrollHeight;
    }

    finishWorkspaceProcess(result) {
        if (result.jobId !== this.activeProcessId) {
            if (!this.activeProcessId && this.processStartPending) this.bufferProcessEvent(result.jobId, 'complete', result);
            return;
        }
        this.activeProcessId = null;
        const stopButton = document.getElementById('stopProcessBtn');
        if (stopButton) stopButton.hidden = true;
        this.appendTerminalMessage(result.signal
            ? `Process stopped (${result.signal}).`
            : `Process finished with exit code ${result.code}.`);
    }

    bufferProcessEvent(jobId, type, result) {
        const events = this.processEventBuffer.get(jobId) || [];
        events.push({ type, result });
        this.processEventBuffer.set(jobId, events);
    }

    async stopWorkspaceProcess() {
        if (!this.activeProcessId || !window.desktopApp?.stopWorkspaceProcess) return;
        try {
            await window.desktopApp.stopWorkspaceProcess(this.activeProcessId);
        } catch (error) {
            this.appendTerminalMessage(`Could not stop process: ${error.message}`);
        }
    }

    async askAI() {
        const response = document.getElementById('aiResponse');
        const sendButton = document.getElementById('aiSendBtn');
        if (!window.desktopApp?.completeWithAI) {
            response.textContent = 'The AI assistant is available in the desktop app only.';
            return;
        }
        const prompt = document.getElementById('aiPrompt').value.trim();
        if (!prompt) {
            response.textContent = 'Enter a question or code request first.';
            return;
        }
        const manager = window.fileManager;
        const context = document.getElementById('aiIncludeFile').checked && manager?.currentFile
            ? `File: ${manager.currentFile}\n\n${document.getElementById('codeEditor').value}`
            : '';
        if (context.length > 50000) {
            response.textContent = 'The current file exceeds the 50,000-character context limit.';
            return;
        }
        if (sendButton) sendButton.disabled = true;
        response.textContent = 'Waiting for the configured model…';
        try {
            this.lastAIResponse = await window.desktopApp.completeWithAI({
                endpoint: document.getElementById('aiEndpoint').value.trim(),
                model: document.getElementById('aiModel').value.trim(),
                apiKey: document.getElementById('aiApiKey').value,
                prompt,
                context
            });
            response.textContent = this.lastAIResponse;
            document.getElementById('aiInsertBtn').disabled = false;
            document.getElementById('aiReplaceBtn').disabled = false;
        } catch (error) {
            this.lastAIResponse = '';
            response.textContent = `Request failed: ${error.message}`;
            document.getElementById('aiInsertBtn').disabled = true;
            document.getElementById('aiReplaceBtn').disabled = true;
        } finally {
            if (sendButton) sendButton.disabled = false;
        }
    }

    applyAIResponse(replaceSelection) {
        if (!this.lastAIResponse) return;
        const editor = document.getElementById('codeEditor');
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        if (replaceSelection && start === end) {
            this.showNotification('Select code in the editor before replacing it.');
            return;
        }
        const codeBlock = this.lastAIResponse.match(/```[^\n]*\n([\s\S]*?)```/);
        const text = codeBlock ? codeBlock[1] : this.lastAIResponse;
        editor.setRangeText(text, start, replaceSelection ? end : start, 'end');
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        editor.focus();
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

    async refreshExternalDisplayMode() {
        if (window.androidApp) {
            this.syncExternalDisplayMode(window.androidApp.isExternalDisplay());
            return;
        }
        if (!window.desktopApp?.getDisplayInfo) return;
        try {
            const displayInfo = await window.desktopApp.getDisplayInfo();
            this.syncExternalDisplayMode(displayInfo.external);
        } catch {
            this.syncExternalDisplayMode(false);
        }
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
