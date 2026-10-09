(async () => {
    const results = document.getElementById('results');
    const frame = document.getElementById('app');
    const source = await (await fetch('../index.html')).text();
    const base = new URL('../', location.href).href;
    const messages = [];
    let assertions = 0;
    const saved = ['nightmare_theme', 'nightmare_files'].map(key => [key, localStorage.getItem(key)]);
    const assert = (condition, message) => {
        if (!condition) throw new Error(message);
        assertions++;
    };
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const probe = `
        window.testErrors = [];
        window.addEventListener('error', e => testErrors.push(e.message));
        window.activeFrames = new Set();
        const nativeRequest = window.requestAnimationFrame.bind(window);
        const nativeCancel = window.cancelAnimationFrame.bind(window);
        window.requestAnimationFrame = callback => {
            const id = nativeRequest(time => { activeFrames.delete(id); callback(time); });
            activeFrames.add(id);
            return id;
        };
        window.cancelAnimationFrame = id => { activeFrames.delete(id); nativeCancel(id); };
    `;
    async function load(prelude = '') {
        await new Promise(resolve => {
            frame.onload = resolve;
            frame.srcdoc = source.replace('<head>', `<head><base href="${base}"><script>${probe}${prelude}<\/script>`);
        });
        assert(frame.contentWindow.testErrors.length === 0, 'App initialized without runtime errors');
        return frame.contentWindow;
    }
    function input(win, id, value) {
        const control = win.document.getElementById(id);
        if (control.type === 'checkbox') control.checked = value;
        else control.value = value;
        control.dispatchEvent(new win.Event('input', { bubbles: true }));
    }
    const style = (win, selector) => win.getComputedStyle(win.document.querySelector(selector));
    const pixels = win => {
        const canvas = win.document.getElementById('matrixCanvas');
        return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    };
    try {
        localStorage.removeItem('nightmare_theme');
        localStorage.removeItem('nightmare_files');
        let win = await load();
        assert(win.document.title === 'Nightmare Designs Code', 'Document title');
        assert(win.document.querySelector('h1').textContent === 'Nightmare Designs Code', 'Accessible exact heading');
        assert(style(win, 'body').backgroundColor === 'rgb(0, 0, 0)', 'Default black background');
        assert(style(win, '.editor-container').borderTopColor === 'rgb(179, 0, 0)', 'Blood-red frame');
        assert(style(win, '#codeEditor').color === 'rgb(0, 255, 0)', 'Bright-green text');
        assert(style(win, '#codeEditor').caretColor === 'rgb(0, 255, 0)', 'Bright-green caret');
        assert(style(win, '#codeEditor').backgroundColor === 'rgba(0, 0, 0, 0)', 'Transparent textarea');
        assert(style(win, '.editor-area').backgroundColor === 'rgba(0, 0, 0, 0)', 'Transparent ancestor');
        assert(style(win, '.editor-wrapper').backgroundColor === 'rgba(0, 0, 0, 0.55)', 'Single editor opacity layer');
        assert(style(win, '#matrixCanvas').opacity === '0.2', 'Single Matrix opacity control');
        assert(style(win, '#matrixCanvas').pointerEvents === 'none', 'Canvas cannot intercept input');
        assert(style(win, '.blood-drips').pointerEvents === 'none', 'Drips cannot intercept input');
        assert(pixels(win).some((value, index) => index % 4 === 1 && value > 0), 'Visible green Matrix pixels');
        const reduced = win.matchMedia('(prefers-reduced-motion: reduce)').matches;
        assert(win.eval('matrix.isRunning') === !reduced, 'Respects real motion preference');
        if (reduced) {
            assert(style(win, '.blood-drips i').animationName === 'none', 'Reduced-motion static drips');
            assert(win.activeFrames.size === 0, 'Reduced-motion Matrix starts static');
        }
        messages.push('PASS defaults, visible canvas, transparency, motion preference');

        input(win, 'backgroundColor', '#112233');
        input(win, 'bloodColor', '#cc2255');
        input(win, 'textColor', '#aaff11');
        input(win, 'matrixColor', '#3388ff');
        input(win, 'panelOpacity', '37');
        input(win, 'animateDrips', false);
        assert(style(win, 'body').backgroundColor === 'rgb(17, 34, 51)', 'Live background');
        assert(style(win, '.logo').color === 'rgb(204, 34, 85)', 'Live blood title');
        assert(style(win, '.blood-drips i').backgroundColor === 'rgb(204, 34, 85)', 'Live blood drips');
        assert(style(win, '#codeEditor').color === 'rgb(170, 255, 17)', 'Live text');
        assert(style(win, '.editor-wrapper').backgroundColor === 'rgba(17, 34, 51, 0.37)', 'Live panel opacity');
        assert(win.eval('matrix.color') === '#3388ff', 'Live Matrix color');
        assert(pixels(win).some((value, index) => index % 4 === 2 && value > 0), 'Blue Matrix drawn');
        assert(style(win, '.blood-drips i').animationName === 'none', 'Explicit drip stop');
        win = await load();
        assert(win.document.getElementById('panelOpacity').value === '37', 'Restored panel control');
        assert(win.document.getElementById('matrixColor').value === '#3388ff', 'Restored Matrix control');
        assert(style(win, 'body').backgroundColor === 'rgb(17, 34, 51)', 'Restored visuals');
        win.document.getElementById('resetTheme').click();
        assert(win.document.getElementById('backgroundColor').value === '#000000', 'Reset background UI');
        assert(win.document.getElementById('panelOpacity').value === '55', 'Reset opacity UI');
        assert(win.document.getElementById('animateDrips').checked, 'Reset drip UI');
        assert(style(win, '.logo').color === 'rgb(179, 0, 0)', 'Reset live blood');
        assert(win.eval('matrix.color') === '#00ff00', 'Reset live Matrix');
        win = await load();
        assert(style(win, 'body').backgroundColor === 'rgb(0, 0, 0)', 'Reset persisted');
        messages.push('PASS live colors, persistence, reset, drip control');

        input(win, 'opacitySlider', '65');
        input(win, 'speedSlider', '7');
        assert(style(win, '#matrixCanvas').opacity === '0.65', 'Matrix opacity still functional');
        assert(win.eval('matrix.speed') === 7, 'Matrix speed still functional');
        if (!win.eval('matrix.isRunning')) win.document.getElementById('pauseBtn').click();
        for (let i = 0; i < 10; i++) win.document.getElementById('pauseBtn').click();
        assert(win.activeFrames.size === 1, 'Repeated pause/resume has one scheduled frame');
        await wait(120);
        assert(win.activeFrames.size === 1, 'Animation keeps one scheduled frame');
        win.document.getElementById('pauseBtn').click();
        const drops = win.eval('matrix.drops.slice()');
        await wait(120);
        assert(win.activeFrames.size === 0, 'Pause cancels scheduled frame');
        assert(JSON.stringify(drops) === win.eval('JSON.stringify(matrix.drops)'), 'Pause stops movement');
        win.document.getElementById('pauseBtn').click();
        win.eval(`Object.defineProperty(document, 'hidden', { configurable: true, value: true })`);
        win.document.dispatchEvent(new win.Event('visibilitychange'));
        assert(win.activeFrames.size === 0, 'Hidden page cancels animation');
        win.eval('delete document.hidden');
        win.document.dispatchEvent(new win.Event('visibilitychange'));
        assert(win.activeFrames.size === 1, 'Visible page resumes one loop');
        win.document.getElementById('pauseBtn').click();
        frame.style.width = '360px';
        frame.style.height = '640px';
        await wait(120);
        assert(win.eval('matrix.columns === Math.ceil(innerWidth / matrix.fontSize)'), 'Resize rebuilds columns');
        assert(win.eval('matrix.drops.length === matrix.columns && matrix.drops.every(Number.isFinite)'), 'Valid resized drops');
        assert(win.document.querySelector('h1').getBoundingClientRect().right < win.innerWidth, 'Narrow heading fits');
        const sidebar = win.document.querySelector('.sidebar');
        sidebar.scrollTop = sidebar.scrollHeight;
        const resetBox = win.document.getElementById('resetTheme').getBoundingClientRect();
        assert(resetBox.bottom <= sidebar.getBoundingClientRect().bottom, 'Theme reset reachable by sidebar scroll');
        win.document.getElementById('toggleSidebar').click();
        assert(win.document.getElementById('terminalInput').getBoundingClientRect().height > 20, 'Terminal input remains sized');
        const editor = win.document.getElementById('codeEditor');
        assert(editor.getBoundingClientRect().height > 100, 'Editor remains usable at narrow width');
        messages.push('PASS animation controls, single loop, resize, narrow layout and settings scroll');

        editor.value = 'first\nsecond';
        editor.dispatchEvent(new win.Event('input', { bubbles: true }));
        assert(win.document.getElementById('lineNumbers').textContent === '1\n2', 'Line numbers update');
        assert(style(win, '#lineNumbers').whiteSpace === 'pre', 'Line numbers preserve newlines');
        editor.selectionStart = editor.selectionEnd = editor.value.length;
        editor.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
        assert(win.eval('fileManager.files[fileManager.currentFile].content.endsWith("\\t")'), 'Tab syncs file contents');
        editor.dispatchEvent(new win.KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
        assert(JSON.parse(localStorage.getItem('nightmare_files'))['untitled.txt'].content === editor.value, 'Save shortcut');
        editor.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true, cancelable: true }));
        assert(win.eval('Object.keys(fileManager.files).length') === 2, 'New shortcut creates exactly one file');
        const terminalInput = win.document.getElementById('terminalInput');
        terminalInput.value = 'echo <b>safe echo</b>';
        terminalInput.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        assert(win.document.querySelector('#terminal .terminal-line:last-child').textContent === '<b>safe echo</b>', 'Echo submission');
        assert(!win.document.querySelector('#terminal b'), 'Command input is text, not markup');
        terminalInput.value = 'cat untitled.txt';
        terminalInput.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        assert(win.document.querySelector('#terminal .terminal-line:last-child').textContent.endsWith('\t'), 'Console file manager works');
        messages.push('PASS editing, line numbers, Tab, save/new shortcuts, echo and cat');

        const distances = win.eval(`(() => {
            const request = window.requestAnimationFrame;
            window.requestAnimationFrame = () => null;
            const distances = [30, 60, 120].map(fps => {
                matrix.isRunning = true;
                matrix.lastTime = null;
                matrix.elapsed = 0;
                matrix.speed = 3;
                matrix.drops.fill(0);
                for (let frame = 0; frame <= fps; frame++) matrix.animate(frame * 1000 / fps);
                return matrix.drops[0];
            });
            window.requestAnimationFrame = request;
            matrix.isRunning = false;
            matrix.resizeCanvas();
            return distances;
        })()`);
        assert(distances.every(distance => Math.abs(distance - 180) <= 6), 'Time-based speed at 30/60/120Hz');
        messages.push('PASS frame-rate-independent animation speed');

        localStorage.setItem('nightmare_theme', '{broken');
        win = await load();
        assert(style(win, 'body').backgroundColor === 'rgb(0, 0, 0)', 'Malformed storage falls back');
        localStorage.setItem('nightmare_theme', JSON.stringify({
            backgroundColor: 'url(bad)', textColor: '#abc', matrixColor: 123,
            panelOpacity: 101, animateDrips: 'false', bloodColor: '#123456'
        }));
        win = await load();
        assert(win.document.getElementById('panelOpacity').value === '55', 'Invalid range rejected');
        assert(win.document.getElementById('textColor').value === '#00ff00', 'Invalid color rejected');
        assert(win.document.getElementById('bloodColor').value === '#123456', 'Valid saved color retained');
        win = await load(`
            Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage denied'); } });
        `);
        input(win, 'textColor', '#abcdef');
        win.document.getElementById('resetTheme').click();
        assert(win.testErrors.length === 0, 'Unavailable storage does not break live settings');
        assert(win.eval('fileManager.currentFile') === 'untitled.txt', 'Editor initializes without storage');
        win = await load('HTMLCanvasElement.prototype.getContext = () => null;');
        assert(win.document.getElementById('codeEditor'), 'Editor survives unavailable canvas context');
        win.document.getElementById('pauseBtn').click();
        assert(win.testErrors.length === 0, 'Canvas fallback controls safe');
        messages.push('PASS malformed/invalid/unavailable storage and unavailable canvas');
        results.textContent = `${messages.join('\n')}\nPASS: ${assertions} assertions`;
        results.dataset.status = 'passed';
    } catch (error) {
        results.textContent = `${messages.join('\n')}\nFAIL: ${error.stack}`;
        results.dataset.status = 'failed';
    } finally {
        for (const [key, value] of saved) {
            if (value === null) localStorage.removeItem(key);
            else localStorage.setItem(key, value);
        }
    }
})();
