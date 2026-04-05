# Installing AIClocker

This guide explains how to install the built AIClocker `.exe`, deal with the Windows SmartScreen warning, and uninstall cleanly.

---

## Requirements

- Windows 10 or 11 (x64)
- Approximately 250 MB free disk space
- No special permissions needed for per-user install

---

## Install

1. Download `AIClocker-Setup-1.1.0.exe` from the releases page (or build it locally — see [README.md](README.md)).
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

## Auto-start with Windows

Right-click the tray icon → tick **Start with Windows**. The preference is saved to `%APPDATA%\AIClocker\data\settings.json`. On next login, AIClocker starts hidden in the tray.

To disable, untick the same menu item.

---

## Updating

AIClocker checks for updates every 6 hours and on launch. When a new version is available, it downloads in the background and installs on next quit + restart. No action needed.

To check manually, just quit and relaunch.

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
