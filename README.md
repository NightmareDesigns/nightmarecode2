# 🩸 Nightmare Code

A dark, aesthetic code editor with an animated Matrix-style background. The desktop app is built with Electron and vanilla HTML, CSS, and JavaScript.

## Features

✨ **Editor Interface**
- Clean, modern dark theme with neon-green accents
- File explorer with file tree navigation
- Multi-tab support for editing multiple files
- File type detection for common programming languages and configuration formats
- Line numbers and code statistics in the status bar
- Safe demo terminal and Build menu (commands are suggestions only; they do not execute)
- Voice menu for speech-to-text dictation, safe built-in editor commands, and read-aloud

🎬 **Animated Matrix Background**
- Falling green code characters on dark background
- Adjustable opacity slider (0-100%)
- Adjustable animation speed (1x-10x)
- Pause/Resume functionality
- Smooth, continuous animation using Canvas API

💾 **File Management**
- Create new files
- Switch between open files via tabs or sidebar
- Draft recovery in browser `localStorage`
- Open a workspace folder and read/save text files in the desktop app
- Filter the workspace file list
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

2. Install dependencies and start the desktop app:
   ```bash
   npm install
   npm start
   ```

   You can also open `index.html` in a browser for basic editing. Browser mode uses
   local draft recovery and downloads saved files; workspace folder access is available
   only in the Electron app.

### Build installers

- **Windows portable EXE:** `npm run package`.
  Produces `dist/NightmareDesignsCode-0.1.0-portable.exe` (x64, no installer required).
- **Linux AppImage:** `npm run dist` on Linux.
- **Android debug APK:** `./android/gradlew -p android assembleDebug` (Linux) or
  `android\gradlew.bat -p android assembleDebug` (Windows). The APK is written to
  `android/app/build/outputs/apk/debug/app-debug.apk`.

The Android build requires JDK 17+, Android SDK Platform 35, and network access on
the first build so the Gradle wrapper and Android Gradle Plugin can be downloaded.
The debug APK is suitable for installation/testing; a signed release APK needs a
developer-owned signing key.
The Windows portable executable is unsigned unless a code-signing certificate is configured.

### Usage

1. **Create a New File**
   - Click the "+ New File" button in the Explorer panel
   - Or use `Ctrl+N` / `Cmd+N`

2. **Edit Code**
   - Click any file in the Explorer to switch to it
   - Or click its tab at the top
   - Type code in the plain-text editor; file types are identified in the status bar

3. **Save Your Work**
   - Use `Ctrl+S` / `Cmd+S` to save to the open workspace (desktop) or download the file (browser)
   - Drafts are recovered from browser `localStorage`; desktop workspace changes are written to disk on explicit save

4. **Customize the Background**
   - Adjust "Matrix Opacity" slider (0-100%)
   - Adjust "Animation Speed" slider (1x-10x)
   - Click "Pause Matrix" to stop/resume animation

5. **Terminal and Build menu**
   - Type commands in the safe demo terminal
   - Available commands: `ls`, `cat`, `lang`, `build`, `run`, `echo`, `clear`, `help`, `pwd`, `date`
   - Build and run only show suggestions. They never launch programs or execute shell commands.
   - Click the terminal header to collapse/expand the panel

6. **Voice**
   - Use the Voice menu to dictate into the editor, say built-in editor commands, or read the current file/selection aloud.
   - Microphone permission is requested only when starting dictation or voice commands.
   - Speech recognition depends on the browser/platform provider and may send audio to a remote service; read-aloud uses the device's speech voices.

## File Structure

```
nightmarecode2/
├── index.html              # Main HTML file
├── css/
│   └── style.css          # All styling and theming
├── js/
│   ├── matrix.js          # Matrix background animation
│   ├── filemanager.js     # File management system
│   └── editor.js          # Editor core functionality
├── android/               # Android APK wrapper and Gradle build
└── README.md              # This file
```

## Customization

### Change Colors

Edit the CSS variables in `css/style.css`:

```css
:root {
    --primary-color: #00ff00;      /* Neon green */
    --dark-bg: #0a0e27;            /* Dark background */
    --accent-color: #ff0080;       /* Accent color */
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

## Platform Support

- Windows desktop: standalone portable x64 EXE
- Linux desktop: AppImage package
- Android: installable APK with file picker and Save dialog
- Browser mode: recent desktop browsers; folder access depends on browser support and is currently not enabled
- Samsung DeX: the Android activity is resizable for DeX windowed use and physical keyboard input
- XREAL glasses: the APK is a regular 2D Android app and can be shown when the connected phone/DeX setup routes its display to the glasses; there is no XREAL spatial SDK integration

The APK has not been tested on physical Samsung DeX or XREAL hardware. Display output depends on the phone, adapter, and glasses supporting the required USB-C DisplayPort path.

Windows and Linux Electron packages can be built with `npm run package` and `npm run dist`, respectively. Android is a separate native WebView wrapper, not an Electron target.

The GitHub Actions workflow builds the Windows EXE, Linux AppImage, and Android APK on matching hosted runners and uploads them as downloadable artifacts.

## Safety and Current Limitations

- Workspace access is scoped to a folder selected through the native dialog. Symbolic links are skipped, and workspace text files are limited to 2 MB.
- The Android APK can open individual text files and save through Android's document picker; workspace-folder management is desktop-only.
- The terminal is simulated. No build, run, plugin, or generated-code commands are executed.
- Voice commands only trigger the listed editor actions; they do not control a coding agent or execute shell commands.
- There is no local/remote AI coding agent or API client, plugin marketplace, Language Server Protocol integration, debugger, real syntax highlighter, or decompiler yet.
- A production plugin or AI-agent system needs provider/marketplace decisions, explicit permissions, command approval, and stronger process isolation before enabling execution.
- Draft recovery uses browser `localStorage`, which is limited in size and is not a substitute for version control or backups.

## Browser Compatibility

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Opera (latest)

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

- Browser mode has no direct workspace folder access
- Terminal and Build menu are demo-only
- No syntax highlighting engine yet
- Single-window editing (no split view)

## Future Enhancements

- [ ] Syntax highlighting, LSP diagnostics, autocomplete, formatters, and debugger support
- [ ] Cloud storage integration
- [ ] Theme customization UI
- [ ] Search and replace across workspace contents
- [ ] Git integration
- [ ] Permissioned plugin system and trusted marketplace support
- [ ] Configurable local/cloud AI coding agent with reviewable diffs and checkpoints
- [ ] Sandboxed build and run tools with explicit user approval
- [ ] Android SDK and app build integration
- [ ] Safe, format-scoped decompiler support
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