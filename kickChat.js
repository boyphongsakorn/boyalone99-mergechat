const WebSocket = require("ws");

const KICK_API_BASE = "https://kick.com/api/v2";
const KICK_SOCKET_URL = "wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679";

async function getChatroomId(channel) {
  const response = await fetch(`${KICK_API_BASE}/channels/${encodeURIComponent(channel)}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; MergeChat/1.0)",
    },
  });
  const data = await response.json();

  if (!response.ok || !data.chatroom || typeof data.chatroom.id !== "number") {
    throw new Error(`Kick channel lookup failed: ${data.message || response.statusText}`);
  }

  return data.chatroom.id;
}

/**
 * Connect to a public Kick channel and stream chat messages.
 * Returns a stop() function.
 */
function startKickWatcher({ channel }, onMessage, onError) {
  if (!channel) {
    onError(new Error("KICK_CHANNEL is not set — skipping Kick chat."));
    return () => {};
  }

  let stopped = false;
  let socket = null;
  let chatroomId = null;
  let reconnectTimer = null;
  let reconnectAttempt = 0;

  function scheduleReconnect() {
    if (stopped || reconnectTimer) return;
    const delay = Math.min(30000, 1000 * 2 ** reconnectAttempt);
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  function connect() {
    if (stopped) return;
    socket = new WebSocket(`${KICK_SOCKET_URL}?protocol=7&client=js&version=8.4.0&flash=false`);

    socket.on("open", () => {
      reconnectAttempt = 0;
      socket.send(JSON.stringify({
        event: "pusher:subscribe",
        data: { auth: "", channel: `chatrooms.${chatroomId}.v2` },
      }));
      console.log(`[kick] connected to ${channel}`);
    });

    socket.on("message", (raw) => {
      let event;
      try {
        event = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (event.event === "pusher:ping") {
        socket.send(JSON.stringify({ event: "pusher:pong", data: {} }));
        return;
      }
      if (event.event !== "App\\Events\\ChatMessageEvent") return;

      let chatMessage;
      try {
        chatMessage = JSON.parse(event.data);
      } catch {
        return;
      }
      onMessage({
        author: chatMessage.sender && chatMessage.sender.username,
        message: chatMessage.content,
        timestamp: chatMessage.created_at || new Date().toISOString(),
      });
    });

    socket.on("close", scheduleReconnect);
    socket.on("error", (err) => {
      if (!stopped) onError(err);
    });
  }

  getChatroomId(channel)
    .then((resolvedChatroomId) => {
      chatroomId = resolvedChatroomId;
      connect();
    })
    .catch((err) => {
      onError(err);
      scheduleReconnect();
    });

  return function stop() {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (socket && typeof socket.close === "function") socket.close();
  };
}

module.exports = { getChatroomId, startKickWatcher };
