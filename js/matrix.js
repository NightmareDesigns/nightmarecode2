class MatrixBackground {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;

        this.ctx = this.canvas.getContext('2d');
        if (!this.ctx) return;

        this.defaults = {
            matrixOpacity: 42,
            matrixColor: '#39ff14',
            backgroundColor: '#000000',
            frameColor: '#8b0000',
            textColor: '#39ff14',
            panelOpacity: 60,
            speed: 3
        };

        this.resizeCanvas();
        this.init();
        this.initThemeControls();

        window.addEventListener('resize', () => {
            this.resizeCanvas();
            this.setupDrops();
        });

        document.addEventListener('visibilitychange', () => {
            this.isRunning = !document.hidden;
        });
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    createDrop(index) {
        const columnX = index * this.fontSize + this.fontSize / 2;
        const startY = Math.random() * this.canvas.height;
        const baseSpeed = this.speed * (0.7 + Math.random() * 0.9);
        const trailLength = Math.floor(8 + Math.random() * 18);
        const resetThreshold = this.canvas.height + Math.random() * this.canvas.height * 0.45;
        const twinkleSeed = Math.random() * Math.PI * 2;

        return {
            x: columnX,
            y: startY,
            speed: baseSpeed,
            trailLength,
            resetThreshold,
            twinkleSeed,
            resetChance: 0.008 + Math.random() * 0.02
        };
    }

    setupDrops() {
        this.columns = Math.max(1, Math.floor(this.canvas.width / this.fontSize));
        this.drops = Array.from({ length: this.columns }, (_, index) => this.createDrop(index));
    }

    init() {
        // Katakana-heavy cinematic mix with fallback symbols
        this.characters = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜｦﾝ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ$#@%&';
        this.fontSize = 16;
        this.setupDrops();
        this.speed = this.defaults.speed;
        this.opacity = this.defaults.matrixOpacity / 100;
        this.isRunning = true;
        this.theme = { ...this.defaults };
        this.frameCount = 0;

        this.loadTheme();
        this.animate();
        this.bindCoreControls();
    }

    randomChar() {
        return this.characters.charAt(Math.floor(Math.random() * this.characters.length));
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        if (!this.isRunning || !this.ctx) return;

        this.frameCount += 1;

        // Stronger trail persistence for cinematic rain
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.11)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.font = `${this.fontSize}px 'Courier New'`;
        this.ctx.textAlign = 'center';

        for (let i = 0; i < this.columns; i++) {
            const drop = this.drops[i];

            // Draw tail from dim -> bright head
            for (let t = drop.trailLength; t >= 0; t--) {
                const y = drop.y - t * this.fontSize;
                if (y < -this.fontSize || y > this.canvas.height + this.fontSize) continue;

                const isHead = t === 0;
                const depth = 1 - t / Math.max(1, drop.trailLength);

                // Slight cinematic shimmer
                const shimmer = 0.85 + 0.2 * Math.sin(this.frameCount * 0.06 + drop.twinkleSeed + t * 0.15);
                const alphaBase = this.opacity * (isHead ? 1.45 : 0.12 + depth * 0.55);
                const alpha = Math.min(1, Math.max(0.03, alphaBase * shimmer));

                this.ctx.fillStyle = this.hexToRgba(this.theme.matrixColor, alpha);
                this.ctx.fillText(this.randomChar(), drop.x, y);

                // Head bloom highlight for movie-like leading glyph
                if (isHead) {
                    this.ctx.fillStyle = `rgba(215, 255, 215, ${Math.min(0.9, alpha * 0.75)})`;
                    this.ctx.fillText(this.randomChar(), drop.x, y);
                }
            }

            // Organic speed drift per column
            const drift = Math.sin((this.frameCount + i * 7) * 0.02 + drop.twinkleSeed) * 0.35;
            drop.y += Math.max(0.4, drop.speed + drift);

            // Non-uniform reset logic
            if (drop.y > drop.resetThreshold && Math.random() < drop.resetChance) {
                this.drops[i] = this.createDrop(i);
                this.drops[i].y = -Math.random() * this.canvas.height * 0.25;
            }
        }
    }

    hexToRgba(hex, alpha) {
        const safeHex = /^#([A-Fa-f0-9]{6})$/.test(hex) ? hex : '#39ff14';
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(safeHex);
        if (!result) return `rgba(57, 255, 20, ${alpha})`;
        const r = parseInt(result[1], 16);
        const g = parseInt(result[2], 16);
        const b = parseInt(result[3], 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    setOpacity(value) {
        const v = Number(value);
        this.opacity = Math.min(1, Math.max(0, v / 100));
        this.theme.matrixOpacity = Math.round(this.opacity * 100);
        this.saveTheme();
    }

    setSpeed(value) {
        const v = Number(value);
        this.speed = Math.min(10, Math.max(1, v));

        // Re-seed drop speeds to reflect updated master speed while keeping organic variance
        if (Array.isArray(this.drops)) {
            this.drops = this.drops.map((drop, index) => ({
                ...drop,
                speed: this.speed * (0.7 + ((index * 37) % 100) / 100 * 0.9)
            }));
        }
    }

    togglePause() {
        this.isRunning = !this.isRunning;
        return this.isRunning;
    }

    applyTheme() {
        const root = document.documentElement;
        root.style.setProperty('--dark-bg', this.theme.backgroundColor);
        root.style.setProperty('--dark-bg-secondary', this.theme.backgroundColor);
        root.style.setProperty('--dark-bg-tertiary', '#0d0d0d');
        root.style.setProperty('--border-color', this.theme.frameColor);
        root.style.setProperty('--text-color', this.theme.textColor);
        root.style.setProperty('--primary-color', this.theme.textColor);
        root.style.setProperty('--matrix-color', this.theme.matrixColor);
        root.style.setProperty('--panel-opacity', (this.theme.panelOpacity / 100).toString());
    }

    saveTheme() {
        try {
            localStorage.setItem('nightmareTheme', JSON.stringify(this.theme));
        } catch (e) {
            // Ignore storage errors
        }
    }

    loadTheme() {
        try {
            const raw = localStorage.getItem('nightmareTheme');
            if (!raw) {
                this.applyTheme();
                return;
            }
            const parsed = JSON.parse(raw);
            this.theme = {
                ...this.defaults,
                ...parsed
            };
            this.opacity = this.theme.matrixOpacity / 100;
            this.applyTheme();
            this.syncThemeUI();
        } catch (e) {
            this.theme = { ...this.defaults };
            this.applyTheme();
        }
    }

    syncThemeUI() {
        const bg = document.getElementById('themeBackgroundColor');
        const frame = document.getElementById('themeFrameColor');
        const text = document.getElementById('themeTextColor');
        const matrix = document.getElementById('themeMatrixColor');
        const panelOpacity = document.getElementById('panelOpacitySlider');
        const panelOpacityValue = document.getElementById('panelOpacityValue');
        const opacityValue = document.getElementById('opacityValue');
        const opacitySlider = document.getElementById('opacitySlider');

        if (bg) bg.value = this.theme.backgroundColor;
        if (frame) frame.value = this.theme.frameColor;
        if (text) text.value = this.theme.textColor;
        if (matrix) matrix.value = this.theme.matrixColor;
        if (panelOpacity) panelOpacity.value = this.theme.panelOpacity;
        if (panelOpacityValue) panelOpacityValue.textContent = `${this.theme.panelOpacity}%`;
        if (opacityValue) opacityValue.textContent = `${this.theme.matrixOpacity}%`;
        if (opacitySlider) opacitySlider.value = this.theme.matrixOpacity;
    }

    initThemeControls() {
        const bg = document.getElementById('themeBackgroundColor');
        const frame = document.getElementById('themeFrameColor');
        const text = document.getElementById('themeTextColor');
        const matrix = document.getElementById('themeMatrixColor');
        const panelOpacity = document.getElementById('panelOpacitySlider');
        const panelOpacityValue = document.getElementById('panelOpacityValue');
        const reset = document.getElementById('resetThemeBtn');

        if (bg) {
            bg.addEventListener('input', (e) => {
                this.theme.backgroundColor = e.target.value;
                this.applyTheme();
                this.saveTheme();
            });
        }

        if (frame) {
            frame.addEventListener('input', (e) => {
                this.theme.frameColor = e.target.value;
                this.applyTheme();
                this.saveTheme();
            });
        }

        if (text) {
            text.addEventListener('input', (e) => {
                this.theme.textColor = e.target.value;
                this.applyTheme();
                this.saveTheme();
            });
        }

        if (matrix) {
            matrix.addEventListener('input', (e) => {
                this.theme.matrixColor = e.target.value;
                this.applyTheme();
                this.saveTheme();
            });
        }

        if (panelOpacity) {
            panelOpacity.addEventListener('input', (e) => {
                const value = Math.min(100, Math.max(10, Number(e.target.value)));
                this.theme.panelOpacity = value;
                this.applyTheme();
                if (panelOpacityValue) panelOpacityValue.textContent = `${value}%`;
                this.saveTheme();
            });
        }

        if (reset) {
            reset.addEventListener('click', () => {
                this.theme = { ...this.defaults };
                this.opacity = this.defaults.matrixOpacity / 100;
                this.speed = this.defaults.speed;
                this.setupDrops();
                this.applyTheme();
                this.syncThemeUI();
                const speedSlider = document.getElementById('speedSlider');
                const speedValue = document.getElementById('speedValue');
                if (speedSlider) speedSlider.value = this.defaults.speed;
                if (speedValue) speedValue.textContent = `${this.defaults.speed}x`;
                this.saveTheme();
            });
        }
    }

    bindCoreControls() {
        const opacitySlider = document.getElementById('opacitySlider');
        if (opacitySlider) {
            opacitySlider.addEventListener('input', (e) => {
                const value = e.target.value;
                this.setOpacity(value);
                const display = document.getElementById('opacityValue');
                if (display) display.textContent = `${value}%`;
            });
        }

        const speedSlider = document.getElementById('speedSlider');
        if (speedSlider) {
            speedSlider.addEventListener('input', (e) => {
                const value = e.target.value;
                this.setSpeed(value);
                const display = document.getElementById('speedValue');
                if (display) display.textContent = `${value}x`;
            });
        }

        const pauseBtn = document.getElementById('pauseBtn');
        if (pauseBtn) {
            pauseBtn.addEventListener('click', () => {
                const isRunning = this.togglePause();
                pauseBtn.textContent = isRunning ? '⏸ Pause Matrix' : '▶ Resume Matrix';
            });
        }
    }
}

// Initialize Matrix background
new MatrixBackground('matrixCanvas');
