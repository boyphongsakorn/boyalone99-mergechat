require("dotenv").config();

const { startYouTubeWatcher } = require("./src/youtubeChat");
const { startTwitchWatcher } = require("./src/twitchChat");

function printMessage(platform, { author, message, timestamp }) {
  const time = new Date(timestamp).toLocaleTimeString();
  console.log(`[${time}] (${platform}) ${author}: ${message}`);
}

function printError(platform, err) {
  console.error(`[${platform}] error: ${err.message}`);
}

async function main() {
  const stopYouTube = await startYouTubeWatcher(
    {
      apiKey: process.env.YOUTUBE_API_KEY,
      videoId: process.env.YOUTUBE_VIDEO_ID,
      channelId: process.env.YOUTUBE_CHANNEL_ID,
    },
    (msg) => printMessage("youtube", msg),
    (err) => printError("youtube", err)
  );

  const stopTwitch = startTwitchWatcher(
    {
      channel: process.env.TWITCH_CHANNEL,
      username: process.env.TWITCH_USERNAME,
      oauthToken: process.env.TWITCH_OAUTH_TOKEN,
    },
    (msg) => printMessage("twitch", msg),
    (err) => printError("twitch", err)
  );

  console.log("Watching chat... press Ctrl+C to stop.");

  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    stopYouTube();
    stopTwitch();
    process.exit(0);
  });
}

main();
