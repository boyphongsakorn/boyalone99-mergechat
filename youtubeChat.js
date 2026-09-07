const { LiveChat } = require("youtube-chat");

const LIVE_BROADCAST_RETRY_MS = 5 * 60 * 1000;

function getMessageText(messageParts) {
  return (messageParts || [])
    .map((part) => part.text || part.emojiText || "")
    .join("");
}

/**
 * Watch public YouTube live chat without the YouTube Data API quota.
 * A channel ID discovers the current live broadcast automatically.
 */
async function startYouTubeWatcher({ videoId, channelId }, onMessage, onError) {
  if (!videoId && !channelId) {
    onError(new Error("Set either YOUTUBE_VIDEO_ID or YOUTUBE_CHANNEL_ID."));
    return () => {};
  }

  let stopped = false;
  let retryTimer = null;
  let liveChat = null;

  function scheduleRetry() {
    if (stopped || retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      startChat();
    }, LIVE_BROADCAST_RETRY_MS);
  }

  async function startChat() {
    if (stopped) return;

    const options = videoId ? { liveId: videoId } : { channelId };
    liveChat = new LiveChat(options);
    liveChat.on("start", (liveId) => {
      console.log(`[youtube] watching live chat for ${liveId}`);
    });
    liveChat.on("chat", (chat) => {
      onMessage({
        author: chat.author.name,
        message: getMessageText(chat.message),
        timestamp: chat.timestamp.toISOString(),
      });
    });
    liveChat.on("end", (reason) => {
      if (!stopped) {
        onError(new Error(`YouTube live chat ended${reason ? `: ${reason}` : "."}`));
        scheduleRetry();
      }
    });
    liveChat.on("error", (error) => {
      if (!stopped) {
        onError(error instanceof Error ? error : new Error(String(error)));
        scheduleRetry();
      }
    });

    try {
      const started = await liveChat.start();
      if (!started && !stopped) scheduleRetry();
    } catch (error) {
      if (!stopped) {
        onError(error instanceof Error ? error : new Error(String(error)));
        scheduleRetry();
      }
    }
  }

  await startChat();

  return function stop() {
    stopped = true;
    if (retryTimer) clearTimeout(retryTimer);
    if (liveChat) liveChat.stop("stopped");
  };
}

module.exports = { startYouTubeWatcher, getMessageText };
