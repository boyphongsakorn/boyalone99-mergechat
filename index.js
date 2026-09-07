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

function startServer() {
  const server = http.createServer((request, response) => {
    if (request.url === "/events") {
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

    if (request.url === "/" || request.url === "/index.html") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      fs.createReadStream(INDEX_FILE).pipe(response);
      return;
    }

    response.writeHead(404);
    response.end("Not found");
  });

  server.listen(PORT, () => {
    console.log(`Chat viewer: http://localhost:${PORT}`);
  });
  return server;
}

async function main() {
  const server = startServer();
  const stopYouTube = await startYouTubeWatcher(
    {
      apiKey: process.env.YOUTUBE_API_KEY,
      videoId: process.env.YOUTUBE_VIDEO_ID,
      channelId: process.env.YOUTUBE_CHANNEL_ID,
    },
    (msg) => handleMessage("youtube", msg),
    (err) => printError("youtube", err)
  );

  const stopTwitch = startTwitchWatcher(
    {
      channel: process.env.TWITCH_CHANNEL,
      username: process.env.TWITCH_USERNAME,
      oauthToken: process.env.TWITCH_OAUTH_TOKEN,
      oauthRefresh: process.env.TWITCH_OAUTH_REFRESH,
    },
    (msg) => handleMessage("twitch", msg),
    (err) => printError("twitch", err)
  );

  const stopKick = startKickWatcher(
    { channel: process.env.KICK_CHANNEL },
    (msg) => handleMessage("kick", msg),
    (err) => printError("kick", err)
  );

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

main();
