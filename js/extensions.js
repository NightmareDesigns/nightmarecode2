class LocalExtensions {
    constructor() {
        this.packs = this.load();
        document.getElementById('importExtensionButton')?.addEventListener('click', () => {
            document.getElementById('extensionFileInput')?.click();
        });
        document.getElementById('extensionFileInput')?.addEventListener('change', (event) => this.importPack(event));
        this.render();
        window.extensionManager = this;
    }

    load() {
        try {
            const packs = JSON.parse(localStorage.getItem('nightmare_extension_packs') || '[]');
            return Array.isArray(packs)
                ? packs.filter((pack) => this.validatePack(pack)).map((pack) => ({
                    ...this.normalizePack(pack),
                    id: typeof pack.id === 'string' ? pack.id : `${Date.now()}-${Math.random().toString(36).slice(2)}`
                }))
                : [];
        } catch {
            return [];
        }
    }

    validatePack(pack) {
        return Boolean(pack && typeof pack === 'object' &&
            pack.schemaVersion === 1 &&
            typeof pack.name === 'string' && pack.name.trim().length > 0 && pack.name.length <= 80 &&
            typeof pack.version === 'string' && pack.version.length <= 32 &&
            typeof pack.description === 'string' && pack.description.length <= 240 &&
            Array.isArray(pack.snippets) && pack.snippets.length > 0 && pack.snippets.length <= 50 &&
            pack.snippets.every((snippet) => snippet && typeof snippet === 'object' &&
                typeof snippet.name === 'string' && snippet.name.trim().length > 0 && snippet.name.length <= 80 &&
                typeof snippet.language === 'string' && /^[a-zA-Z0-9+#.-]{1,32}$/.test(snippet.language) &&
                typeof snippet.body === 'string' && snippet.body.trim().length > 0 && snippet.body.length <= 10000)
        );
    }

    normalizePack(pack) {
        return {
            schemaVersion: 1,
            name: pack.name.trim(),
            version: pack.version,
            description: pack.description,
            snippets: pack.snippets.map((snippet) => ({
                name: snippet.name.trim(),
                language: snippet.language,
                body: snippet.body
            }))
        };
    }

    async importPack(event) {
        const input = event.currentTarget;
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;
        if (file.size > 256 * 1024) {
            this.notify('Snippet packs must be smaller than 256 KB.');
            return;
        }
        try {
            const sourcePack = JSON.parse(await file.text());
            if (!this.validatePack(sourcePack)) throw new Error('This file does not match the supported snippet-pack format.');
            const pack = this.normalizePack(sourcePack);
            if (this.packs.some((existing) => existing.name.toLowerCase() === pack.name.toLowerCase())) {
                throw new Error('A snippet pack with this name is already imported.');
            }
            const savedPack = { ...pack, id: `${Date.now()}-${Math.random().toString(36).slice(2)}` };
            this.packs.push(savedPack);
            if (!this.save()) {
                this.packs.pop();
                return;
            }
            this.render();
            this.notify(`Imported ${savedPack.name}.`);
        } catch (error) {
            this.notify(`Could not import snippet pack: ${error.message}`);
        }
    }

    save() {
        try {
            const value = JSON.stringify(this.packs);
            if (value.length > 2 * 1024 * 1024) throw new Error('Imported packs exceed the 2 MB storage limit.');
            localStorage.setItem('nightmare_extension_packs', value);
            return true;
        } catch (error) {
            this.notify(`Could not save extension packs: ${error.message}`);
            return false;
        }
    }

    removePack(id) {
        const pack = this.packs.find((item) => item.id === id);
        if (!pack || !confirm(`Remove snippet pack "${pack.name}"?`)) return;
        const existing = this.packs;
        this.packs = existing.filter((item) => item.id !== id);
        if (!this.save()) {
            this.packs = existing;
            return;
        }
        this.render();
    }

    insertSnippet(snippet) {
        const editor = document.getElementById('codeEditor');
        if (!editor) return;
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        editor.setRangeText(snippet.body, start, end, 'end');
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        editor.focus();
        this.notify(`Inserted ${snippet.name} (${snippet.language}).`);
    }

    render() {
        const container = document.getElementById('extensionList');
        if (!container) return;
        container.replaceChildren();
        if (!this.packs.length) {
            const empty = document.createElement('p');
            empty.className = 'extensions-empty';
            empty.textContent = 'No snippet packs installed. Import a JSON pack to add reusable code snippets.';
            container.appendChild(empty);
            return;
        }
        for (const pack of this.packs) {
            const section = document.createElement('section');
            section.className = 'extension-pack';
            const heading = document.createElement('div');
            heading.className = 'extension-pack-heading';
            const name = document.createElement('strong');
            name.textContent = pack.name;
            const version = document.createElement('span');
            version.textContent = pack.version ? `v${pack.version}` : 'local';
            heading.append(name, version);
            section.appendChild(heading);
            if (pack.description) {
                const description = document.createElement('p');
                description.textContent = pack.description;
                section.appendChild(description);
            }
            const snippets = document.createElement('div');
            snippets.className = 'extension-snippets';
            for (const snippet of pack.snippets) {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'extension-snippet';
                button.textContent = snippet.name;
                button.title = `Insert ${snippet.name} (${snippet.language})`;
                button.addEventListener('click', () => this.insertSnippet(snippet));
                snippets.appendChild(button);
            }
            section.appendChild(snippets);
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'extension-remove';
            remove.textContent = 'Remove pack';
            remove.addEventListener('click', () => this.removePack(pack.id));
            section.appendChild(remove);
            container.appendChild(section);
        }
    }

    notify(message) {
        window.fileManager?.notify(message);
    }
}

new LocalExtensions();
