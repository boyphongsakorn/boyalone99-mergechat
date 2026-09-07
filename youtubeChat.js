const API_BASE = "https://www.googleapis.com/youtube/v3";

/**
 * Find the video id of a channel's current live broadcast.
 */
async function findLiveVideoId(channelId, apiKey) {
  const url = new URL(`${API_BASE}/search`);
  url.searchParams.set("part", "id");
  url.searchParams.set("channelId", channelId);
  url.searchParams.set("eventType", "live");
  url.searchParams.set("type", "video");
  url.searchParams.set("key", apiKey);

  const res = await fetch(url);
  const data = await res.json();

  if (data.error) {
    throw new Error(`YouTube search API error: ${data.error.message}`);
  }
  if (!data.items || data.items.length === 0) {
    throw new Error("No live broadcast found for this channel right now.");
  }
  return data.items[0].id.videoId;
}

/**
 * Given a video id, return its active live chat id (if the video is live).
 */
async function getActiveLiveChatId(videoId, apiKey) {
  const url = new URL(`${API_BASE}/videos`);
  url.searchParams.set("part", "liveStreamingDetails");
  url.searchParams.set("id", videoId);
  url.searchParams.set("key", apiKey);

  const res = await fetch(url);
  const data = await res.json();

  if (data.error) {
    throw new Error(`YouTube videos API error: ${data.error.message}`);
  }
  const video = data.items && data.items[0];
  const liveChatId = video && video.liveStreamingDetails && video.liveStreamingDetails.activeLiveChatId;

  if (!liveChatId) {
    throw new Error("This video has no active live chat (stream may have ended or isn't live).");
  }
  return liveChatId;
}

/**
 * Poll liveChatMessages.list forever, calling onMessage for each new chat message.
 * Returns a stop() function.
 */
function watchLiveChat(liveChatId, apiKey, onMessage, onError) {
  let pageToken = null;
  let stopped = false;
  let timer = null;

  async function poll() {
    if (stopped) return;
    try {
      const url = new URL(`${API_BASE}/liveChat/messages`);
      url.searchParams.set("liveChatId", liveChatId);
      url.searchParams.set("part", "snippet,authorDetails");
      url.searchParams.set("key", apiKey);
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const res = await fetch(url);
      const data = await res.json();

      if (data.error) {
        throw new Error(`YouTube liveChatMessages error: ${data.error.message}`);
      }

      for (const item of data.items || []) {
        onMessage({
          author: item.authorDetails.displayName,
          message: item.snippet.displayMessage,
          timestamp: item.snippet.publishedAt,
        });
      }

      pageToken = data.nextPageToken || pageToken;
      const interval = data.pollingIntervalMillis || 5000;
      timer = setTimeout(poll, interval);
    } catch (err) {
      onError(err);
      // back off and retry rather than dying completely
      timer = setTimeout(poll, 10000);
    }
  }

  poll();

  return function stop() {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

/**
 * High-level helper: resolve video/live chat id from env-style config and start watching.
 */
async function startYouTubeWatcher({ apiKey, videoId, channelId }, onMessage, onError) {
  if (!apiKey) {
    onError(new Error("YOUTUBE_API_KEY is not set — skipping YouTube chat."));
    return () => {};
  }

  try {
    let resolvedVideoId = videoId;
    if (!resolvedVideoId) {
      if (!channelId) {
        throw new Error("Set either YOUTUBE_VIDEO_ID or YOUTUBE_CHANNEL_ID.");
      }
      resolvedVideoId = await findLiveVideoId(channelId, apiKey);
    }
    const liveChatId = await getActiveLiveChatId(resolvedVideoId, apiKey);
    return watchLiveChat(liveChatId, apiKey, onMessage, onError);
  } catch (err) {
    onError(err);
    return () => {};
  }
}

module.exports = { startYouTubeWatcher };
