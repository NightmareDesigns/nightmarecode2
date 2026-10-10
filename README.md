# 🩸 Nightmare Code

A dark, aesthetic code editor with an animated Matrix-style background. The desktop app is built with Electron and vanilla HTML, CSS, and JavaScript.

## Features

✨ **Editor Interface**
- Clean, modern dark theme with neon-green accents
- File explorer with file tree navigation
- Multi-tab support for editing multiple files
- File type detection for common programming languages and configuration formats
- Line numbers and code statistics in the status bar
- Build and Run for JavaScript and Python files in desktop workspaces, with explicit execution consent
- OpenAI-compatible coding assistant for local model servers or HTTPS API endpoints
- Syntax highlighting for supported languages
- Voice menu for speech-to-text dictation, built-in editor commands, and read-aloud

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
- **Android debug APK:** download the `nightmarecode-android-apk` artifact from GitHub Actions, or build locally with `./android/gradlew -p android assembleDebug` (Linux) or `android\gradlew.bat -p android assembleDebug` (Windows). The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`.

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
   - Type code with syntax highlighting for supported file types; unsupported files remain plain text

3. **Save Your Work**
   - Use `Ctrl+S` / `Cmd+S` to save to the open workspace (desktop) or download the file (browser)
   - Drafts are recovered from browser `localStorage`; desktop workspace changes are written to disk on explicit save

4. **Customize the Background**
   - Adjust "Matrix Opacity" slider (0-100%)
   - Adjust "Animation Speed" slider (1x-10x)
   - Click "Pause Matrix" to stop/resume animation

5. **Build and Run**
   - Open a desktop workspace and select a `.js` or `.py` file.
   - Build performs a JavaScript or Python syntax check; Run executes the selected file with Node.js or Python installed on your computer.
   - Each action asks for confirmation. Project code runs as your user and is not sandboxed; only run code you trust.
   - Process output is shown in Run Output. The Stop button terminates the launched process.

6. **AI assistant**
   - Open the AI assistant tab and enter an OpenAI-compatible chat-completions endpoint and model.
   - The default endpoint/model target a local Ollama-compatible server. Remote endpoints must use HTTPS.
   - API keys remain in memory in the open window and are not saved. The current file is sent only when you check “Include current file.”
   - Review the answer, select code to replace if desired, and use Insert or Replace Selection to apply it.

7. **Voice**
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
├── vendor/                # Bundled syntax highlighter and license
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

- Windows desktop: standalone portable x64 EXE; connecting XREAL as an external monitor automatically enables high-contrast glasses mode when the app window is moved to that display
- Linux desktop: AppImage package
- Android: installable APK with file picker and Save dialog
- Browser mode: recent desktop browsers; folder access depends on browser support and is currently not enabled
- Samsung DeX: the Android activity is resizable for DeX windowed use and physical keyboard input
- XREAL glasses: use either the Windows EXE on a PC with display output or the APK on a compatible Android device; both enable high-contrast glasses mode when the app is on a detected secondary display, with a manual View-menu toggle

This is a standard 2D app, not an XREAL spatial SDK app. Mirroring is controlled by the operating system and cannot be detected independently; automatic glasses mode activates when the app window is assigned to a detected secondary display. On PC, connect the glasses as a display and move the app onto it. The Android APK still needs physical Samsung DeX/XREAL testing. Display output depends on the computer/phone, adapter, and glasses supporting the required display connection.

Windows and Linux Electron packages can be built with `npm run package` and `npm run dist`, respectively. Android is a separate native WebView wrapper, not an Electron target.

The GitHub Actions workflow builds the Windows EXE, Linux AppImage, and Android APK on matching hosted runners and uploads them as downloadable artifacts.

## Safety and Current Limitations

- Workspace access is scoped to a folder selected through the native dialog. Symbolic links are skipped, and workspace text files are limited to 2 MB.
- The Android APK can open individual text files and save through Android's document picker; workspace-folder management is desktop-only.
- Arbitrary terminal shell commands are not supported. Build/Run currently accepts only JavaScript and Python workspace files.
- Build/Run is not OS-sandboxed. Confirmation reduces accidental execution but does not isolate code; untrusted source can access files, network, and processes as the user.
- Voice commands only trigger the listed editor actions; they do not control a coding agent or execute shell commands.
- The AI assistant calls one configured OpenAI-compatible model per request; it is not an autonomous coding agent and cannot operate tools. Local model-server availability depends on installing/configuring that server separately.
- There is no plugin marketplace, Language Server Protocol integration, debugger, or decompiler yet.
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
- Browser mode cannot run builds/programs or call the desktop AI IPC
- Single-window editing (no split view)

## Future Enhancements

- [ ] LSP diagnostics, autocomplete, formatters, and debugger support
- [ ] Cloud storage integration
- [ ] Theme customization UI
- [ ] Search and replace across workspace contents
- [ ] Git integration
- [ ] Permissioned plugin system and trusted marketplace support
- [ ] Configurable local/cloud AI coding agent with reviewable diffs and checkpoints
- [ ] Sandboxed build and run tools with explicit user approval
- [ ] Safe, format-scoped decompiler support
- [ ] Split editor view
- [ ] Arbitrary terminal shell with safe sandbox support

## License

MIT License - Feel free to use, modify, and distribute!

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Author

**NightmareDesigns** - [GitHub Profile](https://github.com/NightmareDesigns)

---

**Made with 🩸 for the dark aesthetic**