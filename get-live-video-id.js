require("dotenv").config();

/**
 * Usage:
 *   YOUTUBE_API_KEY=xxx YOUTUBE_CHANNEL_ID=UCxxxx node get-live-video-id.js
 * or set both in your .env file and just run:
 *   node get-live-video-id.js
 */

const API_BASE = "https://www.googleapis.com/youtube/v3";

async function getLiveVideoId(channelId, apiKey) {
  const url = new URL(`${API_BASE}/search`);
  url.searchParams.set("part", "id,snippet");
  url.searchParams.set("channelId", channelId);
  url.searchParams.set("eventType", "live");
  url.searchParams.set("type", "video");
  url.searchParams.set("order", "date"); // most recent live broadcast first
  url.searchParams.set("key", apiKey);

  const res = await fetch(url);
  const data = await res.json();

  if (data.error) {
    throw new Error(`YouTube API error (${data.error.code}): ${data.error.message}`);
  }

  if (!data.items || data.items.length === 0) {
    throw new Error("This channel has no active live broadcast right now.");
  }

  const live = data.items[0];
  return {
    videoId: live.id.videoId,
    title: live.snippet.title,
    channelTitle: live.snippet.channelTitle,
    url: `https://www.youtube.com/watch?v=${live.id.videoId}`,
  };
}

async function main() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  const channelId = process.env.YOUTUBE_CHANNEL_ID || process.argv[2];

  if (!apiKey) {
    console.error("Missing YOUTUBE_API_KEY (set it in .env or as an env var).");
    process.exit(1);
  }
  if (!channelId) {
    console.error("Missing channel id. Set YOUTUBE_CHANNEL_ID in .env, or run:");
    console.error("  node get-live-video-id.js UCxxxxxxxxxxxxxxxxxxxxxxxx");
    process.exit(1);
  }

  try {
    const result = await getLiveVideoId(channelId, apiKey);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

main();
