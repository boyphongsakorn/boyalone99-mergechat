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
let watchersPromise;
let stopYouTube = () => {};
let stopTwitch = () => {};
let stopKick = () => {};

function publish(event, payload) {
  const message = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const response of clients) response.write(message);
}

function handleMessage(platform, { author, message, timestamp }) {
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
