# 🩸 Nightmare Code

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

2. Open `www/index.html` in your web browser:
   - Simply double-click `www/index.html`, or
   - Use a local server (recommended):
   ```bash
   python -m http.server 8000
   # Then navigate to http://localhost:8000/www/
   ```

### Build the desktop app

Install the dependencies and build the unpacked application for the current host platform:

```bash
npm install
npm run build
```

`npm run dist` creates the configured distributable; the Windows portable package can be built with `npm run package`.

### Build and install the Android APK

The Android app packages the same editor, file manager, menus, Matrix animation, theme settings, and demo terminal as the desktop version. It adapts to display resizing and touch, keyboard, and mouse input for XREAL glasses and Samsung DeX. The terminal remains demo-only on both desktop and Android.

On Windows, run `build-android.bat`. It checks for Java and the Android SDK, installs the required Android SDK packages when `sdkmanager` is available (prompting you to accept Android SDK licenses), installs the locked npm dependencies, builds the APK, and copies it to `dist/NightmareDesignsCode-debug.apk`.

Requirements: Node.js 18 or later, Java 17, and Android SDK Command-line Tools (or Android Platform 35 and Build Tools 35.0.0 already installed). The build downloads the Gradle wrapper and Android dependencies as needed; Google Maven or the configured SciJava fallback must be reachable.

For Linux or macOS, install the dependencies and Android SDK, then run:

```bash
npm install
npm run android:apk
```

The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. Install it on an Android device with `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`, or copy the APK to the device and open it to install. Enable installation from your chosen source if Android prompts you. For release distribution, create and protect your own signing key and configure a signed release build.

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

5. **Terminal**
   - Type commands in the terminal input (demo mode)
   - Available commands: `ls`, `echo`, `clear`, `help`, `pwd`, `date`
   - Click the terminal header to collapse/expand the panel

## File Structure

```
nightmarecode2/
├── www/
│   ├── index.html           # Shared browser, Android, and Electron UI
│   ├── css/
│   │   ├── editor.css       # Responsive editor layout
│   │   └── style.css        # Menu styling
│   └── js/
│       ├── matrix.js        # Matrix background animation
│       ├── filemanager.js   # File management system
│       ├── editor.js        # Editor core functionality
│       └── menu.js          # Application menu
├── android/                 # Capacitor Android project
└── README.md              # This file
```

## Customization

### Change Colors

Edit the CSS variables in `www/css/editor.css`:

```css
:root {
    --primary-color: #00ff00;      /* Neon green */
    --dark-bg: #0a0e27;            /* Dark background */
    --accent-color: #ff0080;       /* Accent color */
    /* ... more variables ... */
}
```

### Modify Matrix Characters

In `www/js/matrix.js`, change the `characters` string:

```javascript
this.characters = '01ﾊﾐﾋｰｳﾅﾓﾆｻﾜﾂｵﾘｱﾎﾃﾏｹﾒｴﾔﾗﾆﾑﾕﾗﾓﾎﾝﾘﾝ';
```

### Add More Languages

Extend the `getFileType()` method in `www/js/filemanager.js` to support more file types.

## Browser Compatibility

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Opera (latest)

### XREAL and Samsung DeX

Use the Android APK for a standalone app, or open the browser version from an Android browser. Both use the same renderer and features. The layout follows the available viewport instead of relying on device-specific user-agent detection.

Requires browser support for:
- Canvas API
- LocalStorage
- ES6 JavaScript

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
- [ ] Theme customization UI
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