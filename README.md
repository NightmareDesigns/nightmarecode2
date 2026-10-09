# 🩸 Nightmare Designs Code

A dark, aesthetic VS Code-inspired code editor with an animated Matrix-style background. Built with vanilla HTML, CSS, and JavaScript.

## Features

✨ **Editor Interface**
- Clean, modern dark theme with neon-green accents
- File explorer with file tree navigation
- Multi-tab support for editing multiple files
- Syntax highlighting support for Python, JavaScript, HTML, CSS, Shell, JSON, and Markdown
- Line numbers and code statistics in the status bar
- Full-featured terminal panel (demo mode)

🎬 **Animated Matrix Background**
- Falling green code characters on dark background
- Adjustable opacity slider (0-100%)
- Adjustable animation speed (1x-10x)
- Pause/Resume functionality
- Smooth, continuous animation using Canvas API

💾 **File Management**
- Create new files
- Switch between open files via tabs or sidebar
- Auto-save functionality (localStorage)
- File type detection and display

⌨️ **Keyboard Shortcuts**
- `Ctrl+S` / `Cmd+S` - Save file
- `Ctrl+N` / `Cmd+N` - New file
- `Ctrl+O` / `Cmd+O` - Open file dialog
- `Tab` - Insert tab in editor

## Getting Started

### Installation

1. Clone the repository:
```bash
git clone https://github.com/NightmareDesigns/nightmarecode2.git
cd nightmarecode2
```

2. Open `index.html` in your web browser:
   - Simply double-click `index.html`, or
   - Use a local server (recommended):
   ```bash
   python -m http.server 8000
   # Then navigate to http://localhost:8000
   ```

### Usage

1. **Create a New File**
   - Click the "+ New File" button in the Explorer panel
   - Or use `Ctrl+N` / `Cmd+N`

2. **Edit Code**
   - Click any file in the Explorer to switch to it
   - Or click its tab at the top
   - Type your code with syntax highlighting

3. **Save Your Work**
   - Click to save or use `Ctrl+S` / `Cmd+S`
   - Files are auto-saved to browser's localStorage

4. **Customize the Background**
   - Adjust "Matrix Opacity" slider (0-100%)
   - Adjust "Animation Speed" slider (1x-10x)
   - Click "Pause Matrix" to stop/resume animation
   - The **Theme** section changes background, frame/blood, text, and Matrix colors.
   - Defaults: pure black (`#000000`), blood red (`#b30000`), bright-green text and Matrix (`#00ff00`), and 55% editor/panel opacity.
   - **Editor / panel opacity** controls the see-through surfaces independently of **Matrix Opacity** (20% by default).
   - Theme settings are saved locally and restored on reload. **Reset theme defaults** resets colors, panel opacity, and decorative drips, without changing files or Matrix controls.
   - Disable **Animate blood drips** to stop the title decoration. Reduced-motion preferences disable drips and start Matrix paused with a static background; Matrix can be explicitly resumed. Animation also pauses while the page is hidden.

5. **Terminal**
   - Type commands in the terminal input (demo mode)
   - Available commands: `ls`, `echo`, `clear`, `help`, `pwd`, `date`
   - Click the terminal header to collapse/expand the panel

## File Structure

```
nightmarecode2/
├── index.html              # Main HTML file
├── css/
│   └── style.css          # All styling and theming
├── js/
│   ├── matrix.js          # Matrix background animation
│   ├── theme.js           # Validated, persistent theme controls
│   ├── filemanager.js     # File management system
│   └── editor.js          # Editor core functionality
└── README.md              # This file
```

## Customization

### Change Colors

Use **Settings → Theme** for live, persistent changes, or edit the defaults in `css/style.css` and `js/theme.js`:

```css
:root {
    --primary-color: #00ff00;      /* Neon green */
    --dark-bg: #000000;            /* Black background */
    --border-color: #b30000;       /* Blood-red frame and title */
    /* ... more variables ... */
}
```

### Modify Matrix Characters

In `js/matrix.js`, change the `characters` string:

```javascript
this.characters = '01ﾊﾐﾋｰｳﾅﾓﾆｻﾜﾂｵﾘｱﾎﾃﾏｹﾒｴﾔﾗﾆﾑﾕﾗﾓﾎﾝﾘﾝ';
```

### Add More Languages

Extend the `getFileType()` method in `js/filemanager.js` to support more file types.

## Browser Compatibility

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Opera (latest)

Requires browser support for:
- Canvas API
- LocalStorage
- ES6 JavaScript

## Browser Regression Checks

Serve the app with `python -m http.server 8000`, then open
`http://localhost:8000/tests/browser.html` in a real browser. The dependency-free
test page checks rendered canvas pixels, resize and timing, theme controls and
persistence/reset, editor shortcuts, console submission, narrow layout, and
invalid/unavailable storage and canvas fallbacks. Use a separate test origin
without saved work; tests temporarily modify and then restore local storage.
Run again with your browser/OS reduced-motion preference enabled to check the
static fallback. Results and assertion counts appear on the page.

## Performance

- Optimized Canvas rendering using requestAnimationFrame
- Efficient DOM updates
- Minimal memory footprint
- Smooth animation even with large files

## Limitations

- Files are stored in browser's localStorage (limited to ~5-10MB)
- Terminal is in demo mode (no actual command execution)
- No syntax highlighting engine (visual formatting only)
- Single-window editing (no split view)

## Future Enhancements

- [ ] Real syntax highlighting with highlight.js
- [ ] Cloud storage integration
- [x] Theme customization UI
- [ ] Search and replace functionality
- [ ] Git integration
- [ ] Plugin system
- [ ] Split editor view
- [ ] Actual terminal execution

## License

MIT License - Feel free to use, modify, and distribute!

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Author

**NightmareDesigns** - [GitHub Profile](https://github.com/NightmareDesigns)

---

**Made with 🩸 for the dark aesthetic**