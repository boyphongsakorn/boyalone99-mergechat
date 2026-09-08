require("dotenv").config();

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const { startYouTubeWatcher } = require("./youtubeChat");
const { startTwitchWatcher } = require("./twitchChat");
const { startKickWatcher } = require("./kickChat");

const PORT = Number(process.env.PORT) || 3000;
const INDEX_FILE = path.join(__dirname, "public", "index.html");
const recentMessages = [];
const clients = new Set();
const IGNORED_AUTHORS = new Set([
  "nightbot",
  "streamelements",
  "moobot",
  "trackerggbot",
  "kofistreambot",
]);
let emotesPromise;
let watchersPromise;
let stopYouTube = () => {};
let stopTwitch = () => {};
let stopKick = () => {};

function publish(event, payload) {
  const message = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const response of clients) response.write(message);
}

function handleMessage(platform, { author, message, timestamp }) {
  if (IGNORED_AUTHORS.has(String(author || "").trim().toLowerCase())) return;

  const chatMessage = { platform, author, message, timestamp };
  recentMessages.push(chatMessage);
  if (recentMessages.length > 200) recentMessages.shift();
  publish("message", chatMessage);

  const time = new Date(timestamp).toLocaleTimeString();
  console.log(`[${time}] (${platform}) ${author}: ${message}`);
}

function printError(platform, err) {
  console.error(`[${platform}] error: ${err.message}`);
  publish("status", { platform, message: err.message });
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Accept: "application/json", ...(options.headers || {}) },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

function addBttvEmotes(catalog, emotes) {
  for (const emote of emotes || []) {
    catalog[emote.code] = `https://cdn.betterttv.net/emote/${emote.id}/2x`;
  }
}

function addSevenTvEmotes(catalog, set) {
  for (const emote of (set && set.emotes) || []) {
    const file = (emote.data && emote.data.host && emote.data.host.files || [])
      .find((item) => item.name === "2x.webp") || emote.data && emote.data.host && emote.data.host.files && emote.data.host.files[0];
    if (file && emote.name && emote.data.host.url) {
      catalog[emote.name] = `${emote.data.host.url}/${file.name}`;
    }
  }
}

function addTwitchEmote(catalog, emote) {
  if (!emote || !emote.code || !emote.id) return;
  catalog[emote.code] = `https://static-cdn.jtvnw.net/emoticons/v2/${emote.id}/default/dark/2.0`;
}

function addTwitchChannelEmotes(catalog, data) {
  for (const product of data.subProducts || []) {
    for (const emote of product.emotes || []) addTwitchEmote(catalog, emote);
  }
  for (const emote of data.bitEmotes || []) addTwitchEmote(catalog, emote);
  for (const group of data.localEmotes || []) {
    for (const emote of group.emotes || []) addTwitchEmote(catalog, emote);
  }
}

async function addTwitchGlobalEmotes(catalog) {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const accessToken = (process.env.TWITCH_OAUTH_TOKEN || "").replace(/^oauth:/, "");
  if (!clientId || !accessToken) return;

  const data = await fetchJson("https://api.twitch.tv/helix/chat/emotes/global", {
    headers: {
      Accept: "application/json",
      "Client-ID": clientId,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  for (const emote of data.data || []) {
    addTwitchEmote(catalog, emote);
  }
}

function loadEmotes() {
  if (emotesPromise) return emotesPromise;

  emotesPromise = (async () => {
    const catalog = {};
    const [bttvGlobal, sevenTvGlobal, twitchGlobal] = await Promise.allSettled([
      fetchJson("https://api.betterttv.net/3/cached/emotes/global"),
      fetchJson("https://7tv.io/v3/emote-sets/global"),
      addTwitchGlobalEmotes(catalog),
    ]);
    if (bttvGlobal.status === "fulfilled") addBttvEmotes(catalog, bttvGlobal.value);
    if (sevenTvGlobal.status === "fulfilled") addSevenTvEmotes(catalog, sevenTvGlobal.value);

    if (process.env.TWITCH_CHANNEL) {
      try {
        const users = await fetchJson(`https://api.ivr.fi/v2/twitch/user?login=${encodeURIComponent(process.env.TWITCH_CHANNEL)}`);
        const user = Array.isArray(users) ? users[0] : users;
        if (user && user.id) {
          const [bttvChannel, sevenTvChannel, twitchChannel] = await Promise.allSettled([
            fetchJson(`https://api.betterttv.net/3/cached/users/twitch/${user.id}`),
            fetchJson(`https://7tv.io/v3/users/twitch/${user.id}`),
            fetchJson(`https://api.ivr.fi/v2/twitch/emotes/channel/${encodeURIComponent(process.env.TWITCH_CHANNEL)}`),
          ]);
          if (bttvChannel.status === "fulfilled") {
            addBttvEmotes(catalog, bttvChannel.value.channelEmotes);
            addBttvEmotes(catalog, bttvChannel.value.sharedEmotes);
          }
          if (sevenTvChannel.status === "fulfilled") addSevenTvEmotes(catalog, sevenTvChannel.value.emote_set);
          if (twitchChannel.status === "fulfilled") addTwitchChannelEmotes(catalog, twitchChannel.value);
        }
      } catch (error) {
        console.error(`[emotes] channel lookup failed: ${error.message}`);
      }
    }
    return catalog;
  })();

  return emotesPromise;
}

function handleRequest(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (requestUrl.pathname === "/events") {
      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      response.write(`event: history\ndata: ${JSON.stringify(recentMessages)}\n\n`);
      clients.add(response);
      request.on("close", () => clients.delete(response));
    return;
  }

  if (requestUrl.pathname === "/emotes") {
    loadEmotes()
      .then((catalog) => {
        response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" });
        response.end(JSON.stringify(catalog));
      })
      .catch((error) => {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end("{}");
        console.error(`[emotes] loading failed: ${error.message}`);
      });
    return;
  }

  if (requestUrl.pathname === "/" || requestUrl.pathname === "/index.html") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      fs.createReadStream(INDEX_FILE).pipe(response);
    return;
  }

  response.writeHead(404);
  response.end("Not found");
}

function startServer() {
  const server = http.createServer(handleRequest);
  server.listen(PORT, () => {
    console.log(`Chat viewer: http://localhost:${PORT}`);
  });
  return server;
}

function startWatchers() {
  if (watchersPromise) return watchersPromise;

  watchersPromise = (async () => {
    stopYouTube = await startYouTubeWatcher(
    {
      videoId: process.env.YOUTUBE_VIDEO_ID,
      channelId: process.env.YOUTUBE_CHANNEL_ID,
    },
    (msg) => handleMessage("youtube", msg),
    (err) => printError("youtube", err)
    );

    stopTwitch = await startTwitchWatcher(
    {
      channel: process.env.TWITCH_CHANNEL,
      username: process.env.TWITCH_USERNAME,
      oauthToken: process.env.TWITCH_OAUTH_TOKEN,
      oauthRefresh: process.env.TWITCH_OAUTH_REFRESH,
    },
    (msg) => handleMessage("twitch", msg),
    (err) => printError("twitch", err)
    );

    stopKick = startKickWatcher(
      { channel: process.env.KICK_CHANNEL },
      (msg) => handleMessage("kick", msg),
      (err) => printError("kick", err)
    );

  })();

  return watchersPromise;
}

async function main() {
  const server = startServer();
  await startWatchers();
  console.log("Watching chat... press Ctrl+C to stop.");

  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    stopYouTube();
    stopTwitch();
    stopKick();
    server.close();
    process.exit(0);
  });
}

if (require.main === module) {
  main();
}

module.exports = handleRequest;
