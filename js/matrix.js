class MatrixBackground {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;

        this.ctx = this.canvas.getContext('2d');
        if (!this.ctx) return;

        this.defaults = {
            matrixOpacity: 40,
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

    setupDrops() {
        this.columns = Math.floor(this.canvas.width / this.fontSize);
        this.drops = Array.from({ length: this.columns }, () => Math.random() * this.canvas.height);
    }

    init() {
        this.characters = '01ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz$#@%&*';
        this.fontSize = 14;
        this.setupDrops();
        this.speed = this.defaults.speed;
        this.opacity = this.defaults.matrixOpacity / 100;
        this.isRunning = true;
        this.theme = { ...this.defaults };

        this.loadTheme();
        this.animate();
        this.bindCoreControls();
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        if (!this.isRunning || !this.ctx) return;

        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.fillStyle = this.hexToRgba(this.theme.matrixColor, this.opacity);
        this.ctx.font = `${this.fontSize}px 'Courier New'`;
        this.ctx.textAlign = 'center';

        for (let i = 0; i < this.columns; i++) {
            const char = this.characters.charAt(Math.floor(Math.random() * this.characters.length));
            this.ctx.fillText(char, i * this.fontSize + this.fontSize / 2, this.drops[i]);

            if (this.drops[i] > this.canvas.height && Math.random() > 0.975) {
                this.drops[i] = 0;
            }

            this.drops[i] += this.speed;
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
