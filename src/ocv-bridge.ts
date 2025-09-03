// Vite bridge to use local node_modules instead of external CDNs
// Exposes a minimal API expected by worldtree-widget.js

import { Repo, BroadcastChannelNetworkAdapter } from '@automerge/automerge-repo';
// The browser adapter is named BrowserWebSocketClientAdapter in the package.
// We alias it to WebSocketClientAdapter for the widget.
import { BrowserWebSocketClientAdapter as WebSocketClientAdapter } from '@automerge/automerge-repo-network-websocket';

// Attach to window in a safe, idempotent way
declare global {
  interface Window {
    AutomergeRepo?: { Repo: typeof Repo; WebSocketClientAdapter: typeof WebSocketClientAdapter; BroadcastChannelNetworkAdapter: typeof BroadcastChannelNetworkAdapter };
  }
}

if (!window.AutomergeRepo) {
  window.AutomergeRepo = { Repo, WebSocketClientAdapter, BroadcastChannelNetworkAdapter };
}

export {};
