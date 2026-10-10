class NightmareCodeEditor {
    constructor() {
        this.voiceRecognition = null;
        this.voiceMode = null;
        this.voiceStopRequested = false;
        this.voicePrivacyNotified = false;
        this.localDictationEnabled = false;
        this.localDictationRecorder = null;
        this.localDictationStream = null;
        this.localDictationRecords = new WeakMap();
        this.glassesModeManuallySet = false;
        this.externalDisplayActive = false;
        this.processEventBuffer = new Map();
        this.processStartPending = false;
        this.decompilationPending = false;
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
        document.getElementById('unrestrictedTerminalToggle')?.addEventListener('change', (event) => this.toggleUnrestrictedTerminal(event));
        document.getElementById('terminalCommandForm')?.addEventListener('submit', (event) => this.submitTerminalCommand(event));
        document.getElementById('aiSendBtn')?.addEventListener('click', () => this.askAI());
        document.getElementById('aiInsertBtn')?.addEventListener('click', () => this.applyAIResponse(false));
        document.getElementById('aiReplaceBtn')?.addEventListener('click', () => this.applyAIResponse(true));
        document.getElementById('aiApplyWorkspaceBtn')?.addEventListener('click', () => this.applyWorkspaceEdits());
        document.getElementById('stopProcessBtn')?.addEventListener('click', () => this.stopWorkspaceProcess());
        document.getElementById('localDictationToggle')?.addEventListener('change', (event) => this.setLocalDictationEnabled(event));
        window.desktopApp?.onDictationProgress?.((status) => {
            if (typeof status === 'string') this.setVoiceStatus(status);
        });
        window.desktopApp?.onProcessOutput?.((result) => this.appendProcessOutput(result));
        window.desktopApp?.onProcessComplete?.((result) => this.finishWorkspaceProcess(result));
        window.desktopApp?.onDecompilerProgress?.((progress) => {
            const message = progress?.status;
            if (typeof message === 'string') window.fileManager?.setStatus(message);
        });
        window.desktopApp?.onTerminalOutput?.((result) => {
            if (typeof result?.enabled === 'boolean') this.setUnrestrictedTerminalUI(result.enabled);
            if (typeof result?.text === 'string') this.appendTerminalMessage(result.text);
        });
        if (!window.desktopApp?.setUnrestrictedTerminalEnabled) {
            const toggle = document.getElementById('unrestrictedTerminalToggle');
            if (toggle) toggle.disabled = true;
        }
        if (!window.desktopApp?.prepareLocalDictation || !window.desktopApp?.transcribeLocalAudio) {
            const toggle = document.getElementById('localDictationToggle');
            if (toggle) toggle.disabled = true;
        }
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

    async toggleUnrestrictedTerminal(event) {
        const toggle = event.currentTarget;
        const requested = toggle.checked;
        toggle.disabled = true;
        try {
            if (!window.desktopApp?.setUnrestrictedTerminalEnabled) {
                throw new Error('The unrestricted terminal is only available in the desktop app.');
            }
            const enabled = await window.desktopApp.setUnrestrictedTerminalEnabled(requested);
            this.setUnrestrictedTerminalUI(enabled);
        } catch (error) {
            this.setUnrestrictedTerminalUI(false);
            this.appendTerminalMessage(`Could not change terminal access: ${error.message}`);
        } finally {
            toggle.disabled = false;
        }
    }

    setUnrestrictedTerminalUI(enabled) {
        const toggle = document.getElementById('unrestrictedTerminalToggle');
        const input = document.getElementById('terminalCommand');
        const submit = document.getElementById('terminalCommandSubmit');
        if (toggle) toggle.checked = enabled;
        if (input) {
            input.disabled = !enabled;
            input.placeholder = enabled ? 'Enter a shell command' : 'Enable terminal to enter commands';
        }
        if (submit) submit.disabled = !enabled;
    }

    async submitTerminalCommand(event) {
        event.preventDefault();
        const input = document.getElementById('terminalCommand');
        const command = input?.value || '';
        if (!command.trim()) return;
        if (!document.getElementById('unrestrictedTerminalToggle')?.checked ||
            !window.desktopApp?.writeTerminalCommand) {
            this.appendTerminalMessage('Enable the unrestricted terminal checkbox first.');
            return;
        }
        this.appendTerminalMessage(`$ ${command}`);
        input.value = '';
        try {
            await window.desktopApp.writeTerminalCommand(command);
        } catch (error) {
            this.appendTerminalMessage(`Terminal command failed: ${error.message}`);
        }
        input.focus();
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

    async decompileCurrentFile() {
        const manager = window.fileManager;
        const fileName = manager?.currentFile;
        const supported = /\.(exe|dll|class|jar|wasm)$/i.test(fileName || '');
        this.showToolsView('terminal');
        document.querySelector('.terminal-panel')?.classList.remove('collapsed');
        if (!window.desktopApp?.decompileWorkspaceFile) {
            this.appendTerminalMessage(window.desktopApp?.platform === 'android'
                ? 'Desktop decompilation is not available on Android; Android cannot run Ghidra, ILSpy, CFR, or WABT.'
                : 'Decompilation is only available in the Windows/Linux Electron desktop app.');
            return;
        }
        if (!manager?.workspaceName || !fileName || !manager.files[fileName]?.isWorkspaceFile) {
            this.appendTerminalMessage('Open a desktop workspace and select a workspace file first.');
            return;
        }
        if (!supported) {
            this.appendTerminalMessage('Decompilation supports .exe, .dll, .class, .jar, and .wasm files.');
            return;
        }
        if (manager.files[fileName]?.dirty) {
            this.appendTerminalMessage('Save the workspace file before decompiling it.');
            return;
        }
        if (this.decompilationPending) {
            this.appendTerminalMessage('A decompilation is already running.');
            return;
        }
        this.decompilationPending = true;
        this.appendTerminalMessage(`Decompiling ${fileName}…`);
        try {
            const result = await window.desktopApp.decompileWorkspaceFile({ file: fileName });
            if (result?.cancelled) {
                this.appendTerminalMessage('Decompilation canceled.');
                return;
            }
            const output = result;
            this.appendTerminalMessage(output);
            this.appendTerminalMessage('Decompilation complete. Output is local and was not sent to an AI endpoint.');
            window.fileManager?.setStatus('Decompilation complete');
        } catch (error) {
            this.appendTerminalMessage(`Decompilation failed: ${error.message}`);
            window.fileManager?.setStatus('Decompilation failed', true);
        } finally {
            this.decompilationPending = false;
        }
    }

    async askAI() {
        const response = document.getElementById('aiResponse');
        const sendButton = document.getElementById('aiSendBtn');
        const review = document.getElementById('aiWorkspaceReview');
        const workspaceEdit = document.getElementById('aiWorkspaceEdit').checked;
        const autoApprove = document.getElementById('aiAutoApprove').checked;
        const currentName = window.fileManager?.currentFile || '';
        if (document.getElementById('aiIncludeFile').checked && /\.(exe|dll|class|jar|wasm)$/i.test(currentName)) {
            response.textContent = 'Binary decompilation inputs stay local and cannot be included in AI requests.';
            return;
        }
        if (!window.desktopApp?.completeWithAI) {
            response.textContent = 'AI requests need the desktop app bridge. Browser and Android can still edit files, but do not have this AI connection.';
            if (workspaceEdit) review.textContent = 'Workspace AI edits require the desktop workspace bridge.';
            return;
        }
        const prompt = document.getElementById('aiPrompt').value.trim();
        if (!prompt) {
            response.textContent = 'Enter a question or code request first.';
            return;
        }
        const manager = window.fileManager;
        let context = '';
        let baselines = null;
        this.lastWorkspaceEdit = null;
        review.replaceChildren();
        document.getElementById('aiApplyWorkspaceBtn').disabled = true;
        if (sendButton) sendButton.disabled = true;
        if (workspaceEdit) {
            try {
                const workspaceContext = await this.getWorkspaceAIContext(manager);
                context = workspaceContext.context;
                baselines = workspaceContext.baselines;
            } catch (error) {
                response.textContent = error.message;
                if (sendButton) sendButton.disabled = false;
                return;
            }
        } else if (document.getElementById('aiIncludeFile').checked && manager?.currentFile) {
            context = `File: ${manager.currentFile}\n\n${document.getElementById('codeEditor').value}`;
        }
        if (context.length > 50000) {
            response.textContent = 'The selected context exceeds the 50,000-character limit. Select fewer or smaller files.';
            if (sendButton) sendButton.disabled = false;
            return;
        }
        const requestPrompt = workspaceEdit
            ? `${prompt}\n\nReturn only valid JSON in this exact shape: {"edits":[{"path":"exact workspace-relative path","content":"complete replacement file text"}]}. Include only files that need changes. Do not use markdown fences. Do not request or perform code execution.`
            : prompt;
        if (sendButton) sendButton.disabled = true;
        response.textContent = 'Waiting for the configured model…';
        try {
            this.lastAIResponse = await window.desktopApp.completeWithAI({
                endpoint: document.getElementById('aiEndpoint').value.trim(),
                model: document.getElementById('aiModel').value.trim(),
                apiKey: document.getElementById('aiApiKey').value,
                prompt: requestPrompt,
                context
            });
            response.textContent = this.lastAIResponse;
            document.getElementById('aiInsertBtn').disabled = false;
            document.getElementById('aiReplaceBtn').disabled = false;
            if (workspaceEdit) {
                this.lastWorkspaceEdit = this.parseWorkspaceEdits(this.lastAIResponse, baselines, manager);
                this.renderWorkspaceEditReview(this.lastWorkspaceEdit);
                document.getElementById('aiApplyWorkspaceBtn').disabled = this.lastWorkspaceEdit.edits.length === 0;
                if (autoApprove && this.lastWorkspaceEdit.edits.length) {
                    await this.applyWorkspaceEdits(true);
                }
            }
        } catch (error) {
            this.lastAIResponse = '';
            response.textContent = `Request failed: ${error.message}`;
            document.getElementById('aiInsertBtn').disabled = true;
            document.getElementById('aiReplaceBtn').disabled = true;
            if (workspaceEdit) review.textContent = `No workspace changes were applied: ${error.message}`;
        } finally {
            if (sendButton) sendButton.disabled = false;
        }
    }

    async getWorkspaceAIContext(manager) {
        if (!manager?.workspaceName || !window.desktopApp?.readWorkspaceFile || !window.desktopApp?.writeWorkspaceFile) {
            throw new Error('Workspace edits need an open desktop workspace with read/write access. Use Ask/Insert/Replace for browser or Android editing.');
        }
        const pathInput = document.getElementById('aiWorkspacePaths').value.trim();
        const paths = pathInput
            ? pathInput.split(/\r?\n/).map((path) => path.trim()).filter(Boolean)
            : (manager.files[manager.currentFile]?.isWorkspaceFile ? [manager.currentFile] : []);
        if (!paths.length) throw new Error('Enter one or more workspace-relative paths, or open a workspace file and leave this field blank.');
        if (paths.length > 20) throw new Error('Select at most 20 workspace files per request.');
        const knownFiles = new Set((manager.workspaceFiles || []).filter((entry) => !entry.directory).map((entry) => entry.path));
        const uniquePaths = [...new Set(paths)];
        if (uniquePaths.length !== paths.length) throw new Error('Remove duplicate workspace paths.');
        for (const path of paths) {
            if (!path || path.length > 512 || path.startsWith('/') || path.includes('\\') ||
                path.split('/').some((part) => !part || part === '.' || part === '..') || !knownFiles.has(path)) {
                throw new Error(`Not an available workspace-relative file: ${path}`);
            }
        }

        const baselines = Object.create(null);
        const sections = [];
        let length = 0;
        for (const path of paths) {
            const diskContent = await window.desktopApp.readWorkspaceFile(path);
            if (typeof diskContent !== 'string') throw new Error(`Could not read workspace text file: ${path}`);
            const editorContent = manager.currentFile === path
                ? document.getElementById('codeEditor').value
                : (manager.files[path]?.loaded ? manager.files[path].content : diskContent);
            if (editorContent.length > 50000 || diskContent.length > 50000) {
                throw new Error(`${path} exceeds the 50,000-character per-file context limit.`);
            }
            baselines[path] = { content: editorContent, diskContent };
            const section = `File: ${path}\n${editorContent}`;
            length += section.length + 2;
            if (length > 50000) throw new Error('Selected workspace files exceed the 50,000-character total context limit. Select fewer or smaller files.');
            sections.push(section);
        }
        return { context: sections.join('\n\n'), baselines };
    }

    parseWorkspaceEdits(response, baselines, manager) {
        if (typeof response !== 'string' || response.length > 150000) {
            throw new Error('The model response exceeds the 150,000-character proposal limit. No files were changed.');
        }
        const jsonText = response.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
        let proposal;
        try {
            proposal = JSON.parse(jsonText);
        } catch {
            throw new Error('The model response was not valid workspace-edit JSON. No files were changed.');
        }
        if (!proposal || !Array.isArray(proposal.edits) || proposal.edits.length > 20) {
            throw new Error('The model response must contain an edits array with at most 20 entries. No files were changed.');
        }
        const allowedPaths = new Set(Object.keys(baselines));
        const seen = new Set();
        let outputLength = 0;
        const edits = proposal.edits.map((edit) => {
            if (!edit || typeof edit.path !== 'string' || typeof edit.content !== 'string' ||
                !allowedPaths.has(edit.path) || seen.has(edit.path)) {
                throw new Error('The model proposed an invalid, duplicate, or unrequested path. No files were changed.');
            }
            if (edit.path.startsWith('/') || edit.path.includes('\\') ||
                edit.path.split('/').some((part) => !part || part === '.' || part === '..')) {
                throw new Error(`Unsafe workspace path in model response: ${edit.path}`);
            }
            if (edit.content.length > 50000) throw new Error(`${edit.path} exceeds the 50,000-character output limit.`);
            outputLength += edit.content.length;
            if (outputLength > 100000) throw new Error('Proposed workspace output exceeds the 100,000-character total limit.');
            seen.add(edit.path);
            return { path: edit.path, content: edit.content, original: baselines[edit.path].content, diskContent: baselines[edit.path].diskContent };
        });
        if (!manager?.workspaceName || !window.desktopApp?.writeWorkspaceFile) {
            throw new Error('Workspace writing is unavailable. No files were changed.');
        }
        return { edits };
    }

    renderWorkspaceEditReview(proposal) {
        const review = document.getElementById('aiWorkspaceReview');
        review.replaceChildren();
        if (!proposal.edits.length) {
            review.textContent = 'The model proposed no file changes.';
            return;
        }
        const heading = document.createElement('strong');
        heading.textContent = `Proposed changes (${proposal.edits.length}) — review before applying`;
        review.appendChild(heading);
        for (const edit of proposal.edits) {
            const details = document.createElement('details');
            const summary = document.createElement('summary');
            summary.textContent = edit.path;
            const preview = document.createElement('pre');
            preview.textContent = `--- current\n${edit.original}\n\n+++ proposed\n${edit.content}`;
            details.append(summary, preview);
            review.appendChild(details);
        }
    }

    async applyWorkspaceEdits(autoApproved = false) {
        const proposal = this.lastWorkspaceEdit;
        const manager = window.fileManager;
        if (!proposal?.edits.length) return;
        if (!manager?.workspaceName || !window.desktopApp?.readWorkspaceFile || !window.desktopApp?.writeWorkspaceFile) {
            this.showNotification('Workspace write access is unavailable; no files were changed.');
            return;
        }
        if (!autoApproved && !confirm(`Apply ${proposal.edits.length} reviewed workspace edit(s)?\n\nThis writes files only. It will not build or run code.`)) return;
        try {
            for (const edit of proposal.edits) {
                const currentDisk = await window.desktopApp.readWorkspaceFile(edit.path);
                const currentEditor = manager.currentFile === edit.path
                    ? document.getElementById('codeEditor').value
                    : (manager.files[edit.path]?.loaded ? manager.files[edit.path].content : edit.original);
                if (currentDisk !== edit.diskContent || currentEditor !== edit.original) {
                    throw new Error(`${edit.path} changed after the proposal. Ask the model again to avoid overwriting newer work.`);
                }
            }
            for (const edit of proposal.edits) {
                await window.desktopApp.writeWorkspaceFile(edit.path, edit.content);
                const file = manager.files[edit.path];
                if (file) {
                    file.content = edit.content;
                    file.loaded = true;
                    file.dirty = false;
                }
            }
            if (proposal.edits.some((edit) => edit.path === manager.currentFile)) {
                const editor = document.getElementById('codeEditor');
                editor.value = manager.files[manager.currentFile].content;
                manager.updateEditor();
            }
            manager.renderFileTree?.();
            manager.updateTabs?.();
            document.getElementById('aiApplyWorkspaceBtn').disabled = true;
            this.lastWorkspaceEdit = null;
            document.getElementById('aiWorkspaceReview').prepend(document.createTextNode('Applied successfully. '));
            this.showNotification(autoApproved ? 'Workspace edits auto-approved and written; no code was run.' : 'Workspace edits written; no code was run.');
        } catch (error) {
            document.getElementById('aiWorkspaceReview').prepend(document.createTextNode(`Could not apply all edits; earlier writes may have succeeded: ${error.message} `));
            this.lastWorkspaceEdit = null;
            document.getElementById('aiApplyWorkspaceBtn').disabled = true;
            this.showNotification(`Workspace edits were not fully applied: ${error.message}`);
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
            if (mode === 'dictation' && this.localDictationRecorder) this.stopLocalDictation();
            else this.stopVoiceRecognition();
            return;
        }

        this.stopVoiceRecognition();
        if (mode === 'dictation' && this.localDictationEnabled) {
            this.startLocalDictation();
            return;
        }
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
        if (this.localDictationRecorder) {
            this.stopLocalDictation(true);
        }
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

    async setLocalDictationEnabled(event) {
        const toggle = event.currentTarget;
        if (!toggle.checked) {
            this.localDictationEnabled = false;
            if (this.localDictationRecorder) this.stopLocalDictation(true);
            return;
        }
        if (!window.desktopApp?.prepareLocalDictation) {
            toggle.checked = false;
            this.showNotification('Local Parakeet dictation is available only in the desktop app.');
            return;
        }
        toggle.disabled = true;
        this.setVoiceStatus('Setting up local dictation…');
        try {
            const prepared = await window.desktopApp.prepareLocalDictation();
            if (!prepared) {
                toggle.checked = false;
                this.setVoiceStatus('Voice off');
                return;
            }
            this.localDictationEnabled = true;
            this.setVoiceStatus('Local Parakeet ready');
        } catch (error) {
            toggle.checked = false;
            this.setVoiceStatus('Voice off');
            this.showNotification(`Could not enable local dictation: ${error.message}`);
        } finally {
            toggle.disabled = false;
        }
    }

    async startLocalDictation() {
        if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
            this.showNotification('Local microphone recording is not available on this platform.');
            return;
        }
        this.voiceMode = 'dictation';
        this.voiceStopRequested = false;
        this.setVoiceStatus('Requesting microphone…');
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            if (this.voiceMode !== 'dictation' || this.voiceStopRequested) {
                stream.getTracks().forEach((track) => track.stop());
                return;
            }
            const mimeType = [
                'audio/webm;codecs=opus',
                'audio/ogg;codecs=opus',
                'audio/mp4'
            ].find((type) => MediaRecorder.isTypeSupported(type));
            const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
            const recording = { stream, chunks: [], bytes: 0, discard: false, tooLarge: false };
            this.localDictationRecords.set(recorder, recording);
            this.localDictationStream = stream;
            this.localDictationRecorder = recorder;
            recorder.ondataavailable = (event) => {
                if (!event.data?.size) return;
                recording.bytes += event.data.size;
                if (recording.bytes > 25 * 1024 * 1024) {
                    recording.tooLarge = true;
                    this.setVoiceStatus('Recording limit reached; stopping…');
                    if (recorder.state !== 'inactive') recorder.stop();
                    return;
                }
                recording.chunks.push(event.data);
            };
            recorder.onerror = () => {
                this.showNotification('Microphone recording failed.');
                this.stopLocalDictation(true);
            };
            recorder.onstop = () => {
                stream.getTracks().forEach((track) => track.stop());
                const wasCurrent = this.localDictationRecorder === recorder;
                if (wasCurrent) {
                    this.localDictationStream = null;
                    this.localDictationRecorder = null;
                    this.voiceMode = null;
                }
                if (recording.discard) {
                    if (wasCurrent) this.setVoiceStatus('Voice off');
                    return;
                }
                if (recording.tooLarge) {
                    this.setVoiceStatus('Voice off');
                    this.showNotification('Local recordings are limited to 25 MB. Try a shorter recording.');
                    return;
                }
                void this.transcribeLocalRecording(recorder.mimeType || recording.chunks[0]?.type || '', recording.chunks);
            };
            recorder.start(1000);
            this.setVoiceStatus('Local dictation recording…');
        } catch (error) {
            stream?.getTracks().forEach((track) => track.stop());
            this.localDictationStream = null;
            this.localDictationRecorder = null;
            this.voiceMode = null;
            this.setVoiceStatus('Voice off');
            this.showNotification(`Could not start local dictation: ${error.message}`);
        }
    }

    stopLocalDictation(discard = false) {
        const recorder = this.localDictationRecorder;
        if (!recorder) {
            this.localDictationStream?.getTracks().forEach((track) => track.stop());
            this.localDictationStream = null;
            this.voiceMode = null;
            this.setVoiceStatus('Voice off');
            return;
        }
        const recording = this.localDictationRecords.get(recorder);
        if (recording) recording.discard = discard;
        this.localDictationRecorder = null;
        this.localDictationStream = null;
        if (this.voiceMode === 'dictation') this.voiceMode = null;
        if (recorder.state !== 'inactive') {
            if (!discard) this.setVoiceStatus('Finishing local recording…');
            recorder.stop();
        }
        if (discard) this.setVoiceStatus('Voice off');
    }

    async transcribeLocalRecording(mimeType, chunks) {
        try {
            const blob = new Blob(chunks, { type: mimeType });
            if (!blob.size) throw new Error('No audio was captured.');
            const audio = new Uint8Array(await blob.arrayBuffer());
            const result = await window.desktopApp.transcribeLocalAudio(audio, mimeType.split(';')[0].toLowerCase());
            if (result?.cancelled) {
                this.setVoiceStatus('Voice off');
                return;
            }
            if (!result || typeof result.text !== 'string') throw new Error('No transcript was returned.');
            if (result.text) this.insertDictation(result.text);
            this.setVoiceStatus('Voice off');
        } catch (error) {
            this.setVoiceStatus('Voice off');
            this.showNotification(`Local transcription failed: ${error.message}. Uncheck local Parakeet to use browser speech recognition.`);
        }
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
