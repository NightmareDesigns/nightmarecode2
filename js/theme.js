const themeDefaults = Object.freeze({
    backgroundColor: '#000000',
    bloodColor: '#b30000',
    textColor: '#00ff00',
    matrixColor: '#00ff00',
    panelOpacity: 55,
    animateDrips: true
});

function validateTheme(saved) {
    const theme = { ...themeDefaults };
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return theme;
    for (const key of ['backgroundColor', 'bloodColor', 'textColor', 'matrixColor']) {
        if (typeof saved[key] === 'string' && /^#[0-9a-f]{6}$/i.test(saved[key])) {
            theme[key] = saved[key];
        }
    }
    if (typeof saved.panelOpacity === 'number' && Number.isFinite(saved.panelOpacity) &&
        saved.panelOpacity >= 0 && saved.panelOpacity <= 100) {
        theme.panelOpacity = saved.panelOpacity;
    }
    if (typeof saved.animateDrips === 'boolean') theme.animateDrips = saved.animateDrips;
    return theme;
}

let theme = { ...themeDefaults };
try {
    theme = validateTheme(JSON.parse(localStorage.getItem('nightmare_theme')));
} catch (_) {
    // Storage may be unavailable or contain invalid JSON.
}

function applyTheme() {
    const root = document.documentElement;
    root.style.setProperty('--dark-bg', theme.backgroundColor);
    root.style.setProperty('--border-color', theme.bloodColor);
    root.style.setProperty('--text-color', theme.textColor);
    root.style.setProperty('--primary-color', theme.textColor);
    root.style.setProperty('--matrix-color', theme.matrixColor);
    const rgb = theme.backgroundColor.slice(1).match(/../g).map(hex => parseInt(hex, 16));
    root.style.setProperty('--panel-bg', `rgba(${rgb.join(', ')}, ${theme.panelOpacity / 100})`);
    root.classList.toggle('drips-paused', !theme.animateDrips);
    for (const key of Object.keys(themeDefaults)) {
        const input = document.getElementById(key);
        if (input.type === 'checkbox') input.checked = theme[key];
        else input.value = theme[key];
    }
    document.getElementById('panelOpacityValue').textContent = theme.panelOpacity + '%';
    window.dispatchEvent(new Event('nightmare-theme-change'));
}

function saveTheme() {
    try {
        localStorage.setItem('nightmare_theme', JSON.stringify(theme));
    } catch (_) {
        // Keep live settings usable when storage is disabled or full.
    }
}

for (const key of Object.keys(themeDefaults)) {
    document.getElementById(key).addEventListener('input', event => {
        const input = event.target;
        const value = input.type === 'checkbox' ? input.checked :
            input.type === 'range' ? Number(input.value) : input.value;
        theme = validateTheme({ ...theme, [key]: value });
        applyTheme();
        saveTheme();
    });
}

document.getElementById('resetTheme').addEventListener('click', () => {
    theme = { ...themeDefaults };
    applyTheme();
    saveTheme();
});

applyTheme();
