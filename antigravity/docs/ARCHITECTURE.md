# Architecture

`desktop/native` contains the WPF bar and a Win32 observer. The observer reads window geometry, focus, and the caption from Antigravity Desktop. The controller translates observations into window placement and renders a usage snapshot over a private stdio connection.

`lib/window-selection.js` resolves the caption to a unique conversation from the local summary index. Captions that match multiple titles are left unresolved. `lib/session-store.js` opens the selected SQLite database read-only. SQLite's data version avoids repeated parsing on idle refreshes. A bounded, in-memory cache retains decoded generation records across chat switches.

`lib/generation.js` reads generation usage, model names, and timing from the SQLite protobuf records. [CodeBurn's storage notes](https://github.com/getagentseal/codeburn/blob/main/docs/providers/antigravity.md) document the underlying SQLite format. The reader counts user input and tool steps from the steps table.

`desktop/install-plugin.js` installs the Windows executables and backend as an [Antigravity Sidecar](https://antigravity.google/docs/sidecars). The Sidecar invokes the executable in the Windows user session. The bar is a single instance and closes when the host window exits. The data layer also works with the manual launcher.

The Sidecar hosts the details page from `web/`. Its read-only snapshot endpoint shares the native monitor's session store. When the host provides a conversation ID, the snapshot resolves that conversation directly. The sidebar view falls back to the last conversation opened in the desktop window.

## Build and test

Run these commands from the `antigravity` folder using Windows x64 and Node.js 24 or later.

| Command | Result |
| --- | --- |
| `npm test` | Run the data, controller, and native layout tests. |
| `npm run build` | Compile the Windows executables. |
| `npm run install:plugin` | Build and install the Sidecar into the current Antigravity profile. |
| `npm run package:windows` | Build the installer and its SHA-256 checksum in `dist/`. |
| `npm start` | Launch the bar manually while Antigravity is open. |

The release installer accepts `/quiet` for unattended installation.
