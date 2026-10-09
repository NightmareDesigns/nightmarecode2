class MatrixBackground {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        try {
            this.ctx = this.canvas && this.canvas.getContext('2d');
        } catch (_) {
            this.ctx = null;
        }
        this.characters = '01ﾊﾐﾋｰｳﾅﾓﾆｻﾜﾂｵﾘｱﾎﾃﾏｹﾒｴﾔﾗﾆﾑﾕﾗﾓﾎﾝﾘﾝ';
        this.fontSize = 14;
        this.speed = 3;
        this.frameId = null;
        this.lastTime = null;
        this.elapsed = 0;
        this.motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
        this.isRunning = !this.motionPreference.matches;
        this.resizeCanvas();
        this.syncAnimation();
        window.addEventListener('resize', () => this.resizeCanvas());
        window.addEventListener('nightmare-theme-change', () => this.refreshColors());
        document.addEventListener('visibilitychange', () => this.syncAnimation());
        this.motionPreference.addEventListener('change', event => {
            this.isRunning = !event.matches;
            this.syncAnimation();
            updatePauseButton();
        });
    }

    resizeCanvas() {
        if (!this.ctx) return;
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.columns = Math.ceil(this.canvas.width / this.fontSize);
        this.drops = Array.from({ length: this.columns }, () => Math.random() * this.canvas.height);
        this.refreshColors();
    }

    refreshColors() {
        if (!this.ctx) return;
        const style = getComputedStyle(document.documentElement);
        this.color = style.getPropertyValue('--matrix-color').trim();
        this.background = style.getPropertyValue('--dark-bg').trim();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawStatic();
    }

    drawStatic() {
        if (!this.ctx) return;
        this.ctx.fillStyle = this.color;
        this.ctx.font = `${this.fontSize}px 'Courier New'`;
        this.ctx.textAlign = 'center';
        for (let i = 0; i < this.columns; i++) {
            for (let row = 0; row < 8; row++) {
                const char = this.characters[Math.floor(Math.random() * this.characters.length)];
                this.ctx.fillText(char, (i + 0.5) * this.fontSize, this.drops[i] - row * this.fontSize);
            }
        }
    }

    syncAnimation() {
        if (this.frameId !== null) cancelAnimationFrame(this.frameId);
        this.frameId = null;
        this.lastTime = null;
        this.elapsed = 0;
        if (this.ctx && this.isRunning && !document.hidden) {
            this.frameId = requestAnimationFrame(time => this.animate(time));
        }
    }

    animate(time) {
        this.frameId = null;
        if (!this.ctx || !this.isRunning || document.hidden) return;
        if (this.lastTime !== null) this.elapsed += Math.min((time - this.lastTime) / 1000, 0.1);
        this.lastTime = time;
        // A fixed drawing cadence keeps trails and speed independent of display refresh rate.
        const step = 1 / 30;
        while (this.elapsed >= step) {
            this.ctx.globalAlpha = 0.12;
            this.ctx.fillStyle = this.background;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.globalAlpha = 1;
            this.ctx.fillStyle = this.color;
            for (let i = 0; i < this.columns; i++) {
                const char = this.characters[Math.floor(Math.random() * this.characters.length)];
                this.ctx.fillText(char, (i + 0.5) * this.fontSize, this.drops[i]);
                this.drops[i] += this.speed * 60 * step;
                if (this.drops[i] > this.canvas.height + this.fontSize * 8) this.drops[i] = 0;
            }
            this.elapsed -= step;
        }
        this.frameId = requestAnimationFrame(nextTime => this.animate(nextTime));
    }

    setOpacity(value) {
        if (this.canvas) this.canvas.style.opacity = Math.max(0, Math.min(100, Number(value))) / 100;
    }

    setSpeed(value) {
        this.speed = Math.max(1, Math.min(10, Number(value)));
    }

    togglePause() {
        this.isRunning = !this.isRunning;
        this.syncAnimation();
        return this.isRunning;
    }
}

const matrix = new MatrixBackground('matrixCanvas');
const opacitySlider = document.getElementById('opacitySlider');
opacitySlider.addEventListener('input', event => {
    matrix.setOpacity(event.target.value);
    document.getElementById('opacityValue').textContent = event.target.value + '%';
});

const speedSlider = document.getElementById('speedSlider');
speedSlider.addEventListener('input', event => {
    matrix.setSpeed(event.target.value);
    document.getElementById('speedValue').textContent = event.target.value + 'x';
});

const pauseBtn = document.getElementById('pauseBtn');
function updatePauseButton() {
    pauseBtn.textContent = matrix.isRunning ? '⏸ Pause Matrix' : '▶ Resume Matrix';
    pauseBtn.setAttribute('aria-pressed', String(!matrix.isRunning));
}
pauseBtn.addEventListener('click', () => {
    matrix.togglePause();
    updatePauseButton();
});
updatePauseButton();
