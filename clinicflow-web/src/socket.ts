import { io } from "socket.io-client";

import {
  API_BASE_URL,
  getPortal,
} from "./lib/api";

/*
 * The server only accepts sockets with a staff or patient
 * session. The session cookie is sent automatically
 * (withCredentials); the auth callback runs on every
 * (re)connect and says which portal is open.
 */
export const socket = io(
  API_BASE_URL,
  {
    autoConnect: true,
    withCredentials: true,
    auth: (callback) => {
      callback({
        portal: getPortal(),
      });
    },
  },
);

/*
 * Call after signing in or out so the socket reconnects
 * with the new session.
 */
export function reconnectSocket() {
  socket.disconnect();
  socket.connect();
}

/*
 * Connection status for the "Live" indicator.
 *
 *   connecting:   first connection not made yet
 *   live:         connected, updates arrive in real time
 *   reconnecting: connection lost, Socket.IO is retrying
 */
export type LiveStatus =
  | "connecting"
  | "live"
  | "reconnecting";

/*
 * Sent to "clinicflow:updated" listeners after a reconnect.
 * Updates broadcast while the socket was down are not
 * replayed, so every live screen reloads once to catch up.
 */
export const RESYNC_UPDATE = { type: "resync" } as const;

let liveStatus: LiveStatus = socket.connected
  ? "live"
  : "connecting";
let hasConnectedBefore = socket.connected;
const statusListeners = new Set<() => void>();

function setLiveStatus(next: LiveStatus) {
  if (next === liveStatus) {
    return;
  }

  liveStatus = next;
  statusListeners.forEach((listener) => listener());
}

socket.on("connect", () => {
  if (hasConnectedBefore) {
    socket
      .listeners("clinicflow:updated")
      .forEach((listener) => listener(RESYNC_UPDATE));
  }

  hasConnectedBefore = true;
  setLiveStatus("live");
});

socket.on("disconnect", () => {
  setLiveStatus(
    hasConnectedBefore ? "reconnecting" : "connecting",
  );
});

socket.on("connect_error", () => {
  setLiveStatus(
    hasConnectedBefore ? "reconnecting" : "connecting",
  );
});

export function getLiveStatus(): LiveStatus {
  return liveStatus;
}

export function subscribeLiveStatus(
  listener: () => void,
): () => void {
  statusListeners.add(listener);

  return () => {
    statusListeners.delete(listener);
  };
}
