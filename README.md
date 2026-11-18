English | [Русский](README.ru.md)

# Polaris

macOS-style desktop widgets for Windows 11: calendar, tasks and a quick note, folders, pomodoro, productivity heatmap and weather.

Tasks, the note, the calendar and the pomodoro log work with an Obsidian vault through plain `.md` files. The interface is available in English and Russian.

## Run

### Prebuilt

1. Open the [Releases](https://github.com/kobold427/polaris/releases) tab and download `Polaris-1.0.0-portable.exe`. It runs without installation. If you prefer an installer, take `Polaris-Setup-1.0.0.exe`.
2. Run the file. It is not signed, so SmartScreen may warn about an unknown publisher. Click "More info", then "Run anyway".
3. The widgets appear on the desktop and the Polaris icon appears in the notification area (it may be behind the "Show hidden icons" arrow). Right-click it to open the menu: settings, widget list, Obsidian connection, quit.

### From source

Requires Windows 11 and [Node.js](https://nodejs.org) 20.14 or newer (npm comes with it). Git is optional.

1. Open PowerShell or Command Prompt and check Node.js:

   ```
   node -v
   ```

   The version must be v20.14 or newer.

2. Get the project.

   With git:

   ```
   git clone https://github.com/kobold427/polaris.git
   cd polaris
   ```

   Without git: on the repository page click Code, then Download ZIP, and extract the archive. Open the extracted folder in File Explorer, type `cmd` in the address bar and press Enter. Command Prompt opens right in that folder.

3. Install dependencies and start:

   ```
   npm install
   npm start
   ```

   The first `npm install` downloads Electron and can take a few minutes. After that, `npm start` is enough.

To stop the app, press Ctrl+C in the terminal or choose Quit in the tray icon menu. To open DevTools for every window, run `npm start -- --dev`.

## Connecting Obsidian

Right-click the tray icon, then Obsidian. If the vault is found automatically, it appears in the list. Otherwise choose "Choose Vault Folder…" and select the vault folder. Until Obsidian is connected, tasks and the note are stored locally and move into the vault once you connect it.

## Build

```
npm run dist
```

The installer and the portable version appear in the `dist` folder. Build on Windows.

A release is built automatically when a tag like `v1.0.0` appears in the repository.
