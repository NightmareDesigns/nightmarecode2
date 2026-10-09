class MatrixBackground {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.resizeCanvas();
        this.init();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    init() {
        // Matrix characters
        this.characters = '01ﾊﾐﾋｰｳﾅﾓﾆｻﾜﾂｵﾘｱﾎﾃﾏｹﾒｴﾔﾗﾆﾑﾕﾗﾓﾎﾝﾘﾝ';
        this.fontSize = 14;
        this.columns = Math.floor(this.canvas.width / this.fontSize);
        this.drops = Array(this.columns).fill(0).map(() => Math.random() * this.canvas.height);
        this.speed = 3;
        this.opacity = 0.2;
        this.isRunning = true;
        this.animate();
    }

    animate() {
        if (!this.isRunning) {
            requestAnimationFrame(() => this.animate());
            return;
        }

        // Semi-transparent dark background
        this.ctx.fillStyle = `rgba(10, 14, 39, 0.1)`;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw characters
        this.ctx.fillStyle = `rgba(0, 255, 0, ${this.opacity})`;
        this.ctx.font = `${this.fontSize}px 'Courier New'`;
        this.ctx.textAlign = 'center';

        for (let i = 0; i < this.columns; i++) {
            const char = this.characters.charAt(Math.floor(Math.random() * this.characters.length));
            this.ctx.fillText(char, i * this.fontSize + this.fontSize / 2, this.drops[i]);

            // Add some randomness for reset
            if (this.drops[i] > this.canvas.height && Math.random() > 0.975) {
                this.drops[i] = 0;
            }

            this.drops[i] += this.speed;
        }

        requestAnimationFrame(() => this.animate());
    }

    setOpacity(value) {
        this.opacity = value / 100;
    }

    setSpeed(value) {
        this.speed = value;
    }

    togglePause() {
        this.isRunning = !this.isRunning;
        return this.isRunning;
    }
}

// Initialize Matrix background
const matrix = new MatrixBackground('matrixCanvas');

// Opacity slider
const opacitySlider = document.getElementById('opacitySlider');
opacitySlider.addEventListener('input', (e) => {
    const value = e.target.value;
    matrix.setOpacity(value);
    document.getElementById('opacityValue').textContent = value + '%';
});

// Speed slider
const speedSlider = document.getElementById('speedSlider');
speedSlider.addEventListener('input', (e) => {
    const value = e.target.value;
    matrix.setSpeed(value);
    document.getElementById('speedValue').textContent = value + 'x';
});

// Pause button
const pauseBtn = document.getElementById('pauseBtn');
pauseBtn.addEventListener('click', () => {
    const isRunning = matrix.togglePause();
    pauseBtn.textContent = isRunning ? '⏸ Pause Matrix' : '▶ Resume Matrix';
});