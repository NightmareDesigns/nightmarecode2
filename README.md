# 🩸 Nightmare Code

A dark, aesthetic code editor with an animated Matrix-style background. The desktop app is built with Electron and vanilla HTML, CSS, and JavaScript.

## Features

✨ **Editor Interface**
- VS Code-inspired dark IDE layout with an activity bar, searchable Explorer, editor tabs and breadcrumbs, and a resizable Terminal/AI panel
- Blue-accented dark theme with a subtle, adjustable Matrix background
- Right-side Extensions panel for importing and inserting local JSON snippet packs (extension JavaScript is not executed)
- File explorer with file tree navigation
- Multi-tab support for editing multiple files
- File type detection for common programming languages and configuration formats
- Line numbers and code statistics in the status bar
- Build and Run for JavaScript and Python files in desktop workspaces, with explicit execution consent
- Decompile native PE executables, managed .NET assemblies, Java bytecode/JARs, and WebAssembly in the Windows/Linux Electron desktop app
- OpenAI-compatible coding assistant for local model servers or HTTPS API endpoints, with reviewable workspace edits
- Syntax highlighting for supported languages
- Voice menu for speech-to-text dictation, built-in editor commands, and read-aloud

🎬 **Animated Matrix Background**
- Falling code characters on a dark editor background
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
- Expand/collapse folders and search matching workspace paths
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
   - Process output is shown in Run Output. Stop requests termination of the launched process.

6. **Decompile**
   - In a Windows/Linux x64 Electron desktop workspace, choose **Build → Decompile current file** for `.exe`, `.dll`, `.class`, `.jar`, or `.wasm`.
   - PE files are routed by inspecting the PE CLR data directory, CLR header, and .NET metadata signature: valid managed `.exe`/`.dll` files use ILSpy 11.1 CLI, while native or unrecognized PE files use Ghidra 12.1.4 headless. ILSpy is not used as a native-PE decompiler. Files lacking valid CLR metadata (including malformed/obfuscated PE) go to Ghidra; mixed-mode files with valid metadata go to ILSpy and may be incomplete or unsupported. The engine is shown in output and errors are reported; there is no manual engine override or fallback after managed classification. Java bytecode/JARs use CFR 0.152; WebAssembly uses WABT 1.0.42 `wasm2wat`.
   - **Runtime/provisioning:** Ghidra requires a 64-bit JDK 21; CFR is a Java CLI and uses that same app-provisioned JDK. ILSpy 11.1 CLI targets .NET 10, and the app provisions its .NET runtime. WABT's `wasm2wat` is a standalone native tool. After native consent, the app downloads pinned Windows/Linux x64 tool/runtime releases, verifies SHA-256 before extraction, and stores them in local app data. Nothing is installed by the user, fetched at app startup, bundled in the installer, or sent to the configured AI endpoint.
   - **Fidelity:** Decompilation cannot recover original source exactly. Ghidra emits approximate pseudo-C, not necessarily compilable source; ILSpy and CFR reconstruct high-level code but cannot restore lost comments, formatting, local names, or source-level constructs. Optimization, obfuscation, stripped symbols, and missing debug metadata reduce fidelity. `wasm2wat` converts Wasm bytecode to low-level WAT; it does not recover the original C/C++/Rust/etc. source. Preserved names/debug sections can help, but are not guaranteed.
   - The app asks before each request. Downloads are on demand, never at startup. Download/extraction progress appears in the status bar; output and errors appear in Run Output. Output is rendered as plain text and capped at 2 MB; inputs are capped at 64 MB and tool execution at 15 minutes. Ghidra output is additionally limited to 500 functions.
   - The app snapshots the selected workspace file and analyzes that copy. It never executes the target file; supported binary formats are blocked from text-opening and AI-context routes, and decompiled output is not sent to the configured AI endpoint. Tool archives are kept locally and are not bundled into the installer.
   - Android's native WebView cannot run these desktop engines; decompilation is unavailable in Android and browser mode.

7. **AI assistant**
   - Open the AI assistant tab and enter an OpenAI-compatible chat-completions endpoint and model.
   - The default endpoint/model target a local Ollama-compatible server. Remote endpoints must use HTTPS.
   - API keys remain in memory in the open window and are not saved. The current file is sent only when you check “Include current file.”
   - Ask/Insert/Replace continue to work for individual-file suggestions. To request workspace edits, enable “Propose edits to workspace files” and enter one or more exact workspace-relative paths (one per line); leaving paths blank uses the current workspace file. Only the selected text files are sent, with a 50,000-character total context limit, a 20-file limit, and a 50,000-character per-file limit.
   - Workspace proposals are returned as complete-file replacements and shown for review before the explicit Apply action. Paths must already be listed in the open workspace. Apply detects files changed since the request and refuses stale proposals. Auto-approve is off by default; opting in writes valid proposals immediately, but never runs or builds code.
   - Prompts and selected file contents go to the configured model endpoint. Only the desktop app has the AI and workspace IPC bridges; browser/Android mode reports this limitation and retains ordinary file editing.

7. **Voice**
   - Use the Voice menu to dictate into the editor, say built-in editor commands, or read the current file/selection aloud.
   - Microphone permission is requested only when starting dictation or voice commands.
   - On desktop, check **Use local Parakeet** to opt in to local speech-to-text. The app requires Python 3.10+ and, after native confirmation, installs the pinned `moondream==2.6.1` package and dependencies into an app-local virtual environment. On first transcription it asks before downloading about 178 MB of Parakeet Redux weights. Recordings are limited to 25 MB, processed locally, and deleted from the temporary recording directory after transcription; the package and downloaded model remain in app data. Python and the installed package run with your user permissions.
   - Leave local Parakeet unchecked to use browser/platform speech recognition, which may send audio to its provider. Local Parakeet is unavailable in browser and Android builds; read-aloud uses the device's speech voices.

8. **Extensions**
   - Open the Extensions icon on the right activity bar and import a local JSON snippet pack. Packs are stored in this browser/app profile and can be removed from the same panel.
   - The supported format is data-only; the app inserts snippet text into the current editor selection and never runs plugin code:
    ```json
    {
      "schemaVersion": 1,
      "name": "My Snippets",
      "version": "1.0.0",
      "description": "Reusable examples",
      "snippets": [
        {
          "name": "Hello",
          "language": "javascript",
          "body": "console.log('Hello');"
        }
      ]
    }
    ```
   - Packs are limited to 256 KB, 50 snippets, and 10,000 characters per snippet. This is not a marketplace or a JavaScript extension host.

## File Structure

```
nightmarecode2/
├── index.html              # Main HTML file
├── main.js                 # Electron IPC, workspace access, and window lifecycle
├── preload.js              # Context-isolated IPC bridge
├── decompiler.js           # Pinned tools, verified acquisition, and local execution
├── parakeet.js             # Optional local Parakeet runtime and transcription
├── js/extensions.js        # Validated, local snippet-pack manager
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
- Guided Build/Run accepts JavaScript and Python workspace files; Decompile supports `.exe`, `.dll`, `.class`, `.jar`, and `.wasm` in the Windows/Linux x64 Electron desktop app.
- The unrestricted terminal is available only in the x64 Windows/Linux desktop app. In browser/Android mode, its checkbox is disabled; use the desktop app instead. In desktop mode, open a workspace, check the terminal option, and confirm the warning. It is off by default on every launch; commands run as your account, are not sandboxed, and can access files outside the workspace, the network, or other programs. Unchecking it, changing workspaces, or closing the app terminates the shell. Interactive full-screen programs that require a TTY are not supported.
- Build/Run is not OS-sandboxed. Confirmation reduces accidental execution but does not isolate code; untrusted source can access files, network, and processes as the user.
- Voice commands only trigger the listed editor actions; they do not control a coding agent or execute shell commands.
- The AI assistant makes one model request at a time; workspace edits are constrained to explicitly selected, listed paths and are not an autonomous shell/tool agent. Local model-server availability depends on installing/configuring that server separately.
- AI/API and workspace-edit bridges are desktop-only; browser and Android have no AI bridge.
- Decompilation analyzes untrusted file contents but is not OS-sandboxed; the selected target is never executed. Keep tools current by updating the app's pinned tool manifest. Output is limited to 2 MB, input files to 64 MB, each tool download to a bounded size, and each process to 15 minutes.
- Android is a separate WebView app and cannot run Ghidra, ILSpy, CFR, or WABT. Browser mode also has no decompiler or workspace IPC.
- An autonomous AI agent or plugin system needs explicit permissions and stronger process isolation before it can execute tools.
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
- [x] Decompiler backend for supported formats, including on-demand verified tool acquisition
- [ ] Split editor view
- [ ] Arbitrary terminal shell with safe sandbox support

## License

MIT License - Feel free to use, modify, and distribute!

### Decompiler tool notices

The Electron desktop app downloads pinned upstream tools only after a user requests decompilation. The tools remain in the local app-data directory and are not included in the app installer:

- Ghidra 12.1.4 — Apache License 2.0; https://github.com/NationalSecurityAgency/ghidra
- ILSpy 11.1.0.9782 — MIT License; https://github.com/icsharpcode/ILSpy
- CFR 0.152 — MIT License; https://www.benf.org/other/cfr/
- WABT 1.0.42 — Apache License 2.0; https://github.com/WebAssembly/wabt
- Eclipse Temurin JDK 21.0.12.1+1 (64-bit) — GPLv2 with Classpath Exception; https://github.com/adoptium/temurin21-binaries
- .NET Runtime 10.0.12 — MIT License; https://github.com/dotnet/runtime

Downloads use fixed upstream URLs and embedded SHA-256 values. Archive entries are checked for traversal, links outside the install directory, special files, and size limits before they are written. Tool output is shown as text; binaries and decompiled content remain local.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Author

**NightmareDesigns** - [GitHub Profile](https://github.com/NightmareDesigns)

---

**Made with 🩸 for the dark aesthetic**