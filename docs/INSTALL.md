# Installing AIClocker

AIClocker ships in two flavors:

| Flavor | File | Best for |
|---|---|---|
| **Installer** | `AIClocker-Setup.exe` | Normal use — installs to Program Files or user dir, adds Start Menu + desktop shortcuts, proper uninstaller, auto-updates |
| **Portable** | `AIClocker-Portable.exe` | USB stick, restricted machines, "no traces" use — single exe, stores all data in a folder next to itself, zero registry writes |

This guide covers both. Skip to [Portable version](#portable-version) if that's what you want.

---

## Requirements

- Windows 10 or 11 (x64)
- Approximately 250 MB free disk space (installer) or 85 MB (portable)
- No special permissions needed for per-user install or portable use

---

## Installer version

1. Download `AIClocker-Setup.exe` from the [releases page](https://github.com/MorlachAU/aiclocker/releases) (or build it locally — see [../README.md](../README.md)).
2. Double-click the `.exe`.
3. **SmartScreen warning:** Windows may show "Windows protected your PC" because the installer is signed with a self-signed certificate. This is expected. To proceed:
   - Click **More info**
   - Click **Run anyway**
4. The NSIS installer will ask:
   - Install for current user (no admin needed) or all users (requires admin)
   - Where to install (default: `%LOCALAPPDATA%\Programs\AIClocker\`)
5. Click **Install** and wait ~10 seconds.
6. On completion, AIClocker starts automatically and a purple clock icon appears in your system tray.

---

## Eliminate the SmartScreen warning (optional)

If you don't want the "Unknown publisher" warning every time you update, you can tell Windows to trust the signing certificate:

1. Locate `certs/aiclocker.cer` in the source tree.
2. Double-click it.
3. Click **Install Certificate...**
4. Choose **Local Machine** (requires admin) for machine-wide or **Current User** for just you.
5. Select **Place all certificates in the following store**.
6. Click **Browse...** and pick **Trusted Root Certification Authorities**.
7. Click **Next → Finish**.
8. Confirm the "Security Warning" dialog.

Now Windows trusts any code signed by the AIClocker cert, and SmartScreen will no longer flag it.

---

## First launch

On first run, AIClocker will:
1. Create its data directory at `%APPDATA%\AIClocker\data\`.
2. If it finds an existing database at a legacy location (`E:\Dev\aiclocker\data\usage.db` or `E:\Dev\claude-usage-tracker\data\usage.db`), it copies it over.
3. Parse all Claude Code and Co-Work JSONL logs on your machine (this takes 10-15 seconds the first time).
4. Start watching those directories for new activity.
5. Show stats in the tray icon.

---

## Using AIClocker

### Tray menu (right-click the clock icon)

| Item | What it does |
|---|---|
| Session header | Shows the current session title, model, and active/idle status |
| Today / This Week stats | Cost, tokens, and active time since midnight / Monday |
| Today by model | Breakdown of Opus / Sonnet / Haiku usage |
| Open Dashboard | Launches the full dashboard window |
| About AIClocker... | Opens the About dialog with branding and links |
| Start with Windows ☑ | Toggles auto-start on login (hidden in portable builds) |
| Quit | Exits AIClocker |

### Dashboard window (accessed via Open Dashboard)

Full charts view with:
- **Menu bar:** File / View / Help across the top
  - `File → Close Window` (Ctrl+W), `File → Quit AIClocker` (Ctrl+Q)
  - `View → Reload`, `View → Fullscreen`, `View → Toggle DevTools`
  - `Help → View on GitHub`, `Help → Report an Issue`
  - `Help → MouseWheel Digital`, `Help → Buy Me a Coffee`
  - `Help → About AIClocker`
- **Summary cards:** API-equivalent cost, total tokens, active time, sessions, messages
- **Date range picker:** Today / This Week / This Month / All Time
- **Charts:** Daily cost, model usage doughnut, token type breakdown, top tools
- **Sessions table:** Scrollable list with title, date, duration, tokens, cost

### About dialog

Accessible from both the tray menu and `Help → About AIClocker`. Shows the MouseWheel Digital logo, version, tagline, and three buttons:
- `mousewheeldigital.com` — opens the brand website
- `☕ Buy Me a Coffee` — opens buymeacoffee.com/mousewheeldigital
- `GitHub` — opens the AIClocker repo

Also has the feedback email (`feedback@mousewheeldigital.com`) with a one-click Copy button. Close with the Close button or Escape key.

---

## Auto-start with Windows

Right-click the tray icon → tick **Start with Windows**. The preference is saved to `%APPDATA%\AIClocker\data\settings.json`. On next login, AIClocker starts hidden in the tray.

To disable, untick the same menu item.

---

## Updating

AIClocker checks for updates every 6 hours and on launch. When a new version is available, it downloads in the background and installs on next quit + restart. No action needed.

To check manually, just quit and relaunch.

---

## Portable version

No installation needed. Just run the exe.

### How it works
- Download `AIClocker-Portable.exe`
- Put it anywhere — USB stick, `Documents`, a project folder, wherever
- Double-click to run
- First launch creates an `AIClocker-data/` folder **next to the exe** containing:
  - `usage.db` — your stats database
  - `electron/` — Electron's own cache/prefs
  - Nothing else, nowhere else

### Moving between machines
Just copy the exe AND the `AIClocker-data/` folder together. The portable version never writes to the registry, never touches `%APPDATA%`, never leaves leftovers. To "uninstall", delete the two items and you're done.

### SmartScreen
Same as the installer — self-signed cert triggers "Unknown publisher". Click "More info → Run anyway".

### Differences from the installer version
- No Start Menu shortcut, no desktop shortcut (you make your own shortcuts if you want)
- **No "Start with Windows" option** — hidden from the tray menu because writing registry autostart entries would be orphaned when the exe moves or gets deleted
- No auto-updater — grab a newer portable exe manually when you want to update
- No admin permissions ever
- Nothing to uninstall

### Data migration
Portable builds do **not** copy data from an installed version. If you want to carry your history to a portable build, copy `%APPDATA%\AIClocker\data\usage.db` into the portable's `AIClocker-data\` folder manually.

---

## Uninstall

1. Open Windows Settings → Apps → Installed apps.
2. Find **AIClocker** in the list.
3. Click **Uninstall**.
4. The uninstaller removes the program files but leaves your data at `%APPDATA%\AIClocker\data\` by default (in case you reinstall later).
5. To also remove your data, delete `%APPDATA%\AIClocker\` manually after uninstalling.

---

## Troubleshooting

### The tray icon doesn't appear
- Check Windows Settings → Personalization → Taskbar → System tray icons → ensure AIClocker is set to "Show icon"
- Or look in the overflow "^" arrow next to the tray

### Stats show 0 everywhere
- Make sure you actually have Claude Code or Co-Work activity
- Check that `%USERPROFILE%\.claude\projects\` exists and contains `.jsonl` files
- Quit AIClocker and relaunch to force re-ingestion

### High RAM usage
- ~60-80 MB idle is normal for a tray-only Electron app
- If it grows to 500+ MB, that's a bug — quit and relaunch, then report the issue

### Can't find where data is stored
- `%APPDATA%\AIClocker\data\usage.db` (installed)
- `<projectRoot>\data\usage.db` (dev mode, running from source)

### Auto-updater not working
- Requires an internet connection
- Requires the GitHub release repo to exist and contain compatible `latest.yml` + installer
- Self-signed builds can update fine; the updater trusts the existing app's signature
- Check logs via Windows Event Viewer or the app's console output
