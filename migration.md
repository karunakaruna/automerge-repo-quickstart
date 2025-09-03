# Migration Guide: Embed the Automerge Task List UI into an existing Express/WebSocket server

This guide explains how to merge this Vite + React Automerge client into your existing Express project (which already has routes, WebSockets, and internal data). The client is already configured to talk to a WebSocket sync server at `ws://localhost:3030`.

Use this as a step-by-step list for another automation/LLM to follow when migrating.

---

## 1) What to zip and move
Zip the following from this project and place them into a `client/` directory at the root of your target Express project (or another suitable subfolder):

- Core app source (required)
  - `src/main.tsx`
  - `src/index.css`
  - `src/rootDoc.ts`
  - `src/components/App.tsx`
  - `src/components/TaskList.tsx` (and any related files next to it)
  - `src/components/DocumentList.tsx`
  - `src/components/SyncControls.tsx`
  - `src/components/ConnectionStatus.tsx`
- Public/static assets (required)
  - `public/automerge.png`
  - `public/vite.svg` (optional)
- HTML entry (required)
  - `index.html`
- Build configuration (required)
  - `vite.config.ts`
  - `tsconfig.json`
  - `tsconfig.node.json`

Do NOT overwrite your server’s `package.json`. We will merge dependencies instead.

Optional to include for linting only:
- `.eslintrc.cjs`

---

## 2) Dependencies to install in the target project
Merge these into your existing server project’s `package.json` and install. Use the same versions to avoid mismatches (you can upgrade later once it’s working).

Add to `dependencies`:
- `@automerge/react`: `^2.0.0`
- `@picocss/pico`: `^2.0.6`
- `react`: `^18.3.1`
- `react-dom`: `^18.3.1`
- `react-use`: `^17.6.0`
- `vite-plugin-wasm`: `^3.3.0`

Add to `devDependencies`:
- `@vitejs/plugin-react`: `^4.3.3`
- `typescript`: `^5.2`
- `vite`: `^5`

Optional (linting):
- `eslint`: `^8.45.0`
- `eslint-plugin-react-hooks`: `^4.6.0`
- `eslint-plugin-react-refresh`: `^0.4.3`
- `typescript-eslint`: `^7.3.1`

Then install (npm):
```powershell
npm config set production false
npm install
```

Note: On Windows, npm sometimes fails to install optional native rollup deps. If you see a Rollup optional-deps error, clean and reinstall:
```powershell
npx rimraf node_modules
remove-item package-lock.json
npm install
```

---

## 3) Directory layout inside the target project
Recommended structure in your Express project:
```
<your-express-project>/
  client/               # place the zipped frontend files here
    src/
    public/
    index.html
    vite.config.ts
    tsconfig*.json
  server/               # your existing express code (example)
  package.json          # single root package.json (monorepo not required)
```

If you keep a single `package.json` at the root, Vite will work if you run it with CWD set to `client/`. Alternatively, you can keep `client/` as its own package.json, but this guide assumes a single root.

---

## 4) Vite configuration and dev workflow
The included `client/vite.config.ts` already sets up React + WASM plugin and `esnext` targets. For local development, run the client on port 5173 and your Express + WebSocket server on port 3030.

Start dev servers in two terminals:
- Terminal A (server):
  ```powershell
  node server.js
  # or: npm run dev-server
  ```
- Terminal B (client UI):
  ```powershell
  cd client
  npm run dev
  # opens http://localhost:5173
  ```

The client is already configured in `src/main.tsx` to connect to `ws://localhost:3030` using `WebSocketClientAdapter`.

Optional: Same-origin proxy (WebSocket) during dev
- If you prefer the UI to talk to your server without cross-origin WS, you can change the adapter to a relative path and add a Vite proxy. Example changes:
  - In `client/src/main.tsx`:
    ```ts
    // e.g., ws path under same origin
    const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/sync`;
    const wsAdapter = new WebSocketClientAdapter(wsUrl);
    ```
  - In `client/vite.config.ts`:
    ```ts
    export default defineConfig({
      // ...existing config
      server: {
        proxy: {
          '/sync': {
            target: 'http://localhost:3030',
            ws: true,
            changeOrigin: true,
          },
        },
      },
    });
    ```

---

## 5) Production build and serving via Express
Build the client assets:
```powershell
cd client
npm run build
# outputs client/dist/
```

Serve from Express (example):
```ts
// server/static-ui.ts (example file in your project)
import path from 'node:path';
import express from 'express';

export function mountClient(app: express.Express) {
  const distPath = path.join(__dirname, '../client/dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}
```
Then add in your server bootstrap:
```ts
import express from 'express';
import { mountClient } from './static-ui';

const app = express();
// ...your existing routes and ws setup
mountClient(app);
app.listen(3030, () => console.log('Server listening on http://localhost:3030'));
```

If you keep WS at `ws://localhost:3030`, the UI will connect cross-origin in dev (5173 -> 3030) and same-origin in prod (served from 3030).

---

## 6) WebSocket sync server considerations
- The UI expects an Automerge Repo WebSocket sync endpoint. If your current WS is custom, you have options:
  - Run a dedicated Automerge sync endpoint alongside your existing WS (recommended to keep concerns separate initially).
  - Implement/bridge the Automerge sync protocol within your existing WS path and route messages accordingly.
- The client exposes the adapter on `window.wsAdapter` for diagnostics; the `ConnectionStatus` component shows status, last message, bytes, and best-effort peer count (if your server publishes it in JSON messages under `peerCount` or `peers`).

If your server uses a binary protocol only, the peer count will show as `—` unless you inject a simple JSON status broadcast periodically.

---

## 7) Commands for the automation/LLM to run in the target project
Assuming you’ve placed the zip into the project root and extracted to `client/`:

1. Unpack UI zip into `client/`:
```powershell
# unzip client.zip -d client   # (the LLM should run the platform-appropriate unzip command)
```

2. Install dependencies (merge versions into root package.json first):
```powershell
npm config set production false
npm install
```

3. Development:
```powershell
# Terminal A
npm run dev-server   # or: node server.js (your existing command)

# Terminal B
cd client
npm run dev          # launches Vite on http://localhost:5173
```

4. Production build and serve:
```powershell
cd client
npm run build
# Ensure Express mounts client/dist as static and serves index.html fallback
```

---

## 8) Minimal code touch points you may need to edit
- `client/src/main.tsx`: confirm the WebSocket URL you want (`ws://localhost:3030` or a proxied path like `/sync`).
- `client/vite.config.ts`: add a `server.proxy` clause if using a relative WS path in dev.
- Your Express bootstrap: add static serving for `client/dist` in prod.

---

## 9) Troubleshooting
- Vite not found: ensure devDependencies are installed (`npm config set production false`, then reinstall).
- Rollup optional-deps error on Windows: clean `node_modules` and `package-lock.json`, reinstall.
- Mixed content: if serving over HTTPS, use `wss://` for the WebSocket.
- Port conflicts: adjust Vite dev port (`--port 5173`) or your server port.

---

## 10) Verification checklist
- UI loads at http://localhost:5173 in dev, http://localhost:3030 in prod.
- Footer shows Doc Info and Connection status.
- Creating/selecting task lists updates the hash URL and syncs between multiple clients.
- WebSocket connects to your server and transfers data (bytes counter increases).

---

If you want, I can tailor this for your server’s exact WS route structure and add a proxy config snippet for your preferred path (e.g., `/ws/automerge`).
