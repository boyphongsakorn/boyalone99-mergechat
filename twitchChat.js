const tmi = require("tmi.js");

/**
 * Connect to a Twitch channel's chat and stream messages.
 * Works anonymously (read-only) if no username/token is given.
 * Returns a stop() function.
 */
function startTwitchWatcher({ channel, username, oauthToken }, onMessage, onError) {
  if (!channel) {
    onError(new Error("TWITCH_CHANNEL is not set — skipping Twitch chat."));
    return () => {};
  }

  const identity =
    username && oauthToken
      ? { username, password: oauthToken.startsWith("oauth:") ? oauthToken : `oauth:${oauthToken}` }
      : {}; // anonymous, read-only

  const client = new tmi.Client({
    options: { skipMembership: true },
    connection: { reconnect: true, secure: true },
    identity,
    channels: [channel],
  });

  client.on("message", (_channel, tags, message, self) => {
    if (self) return;
    onMessage({
      author: tags["display-name"] || tags.username,
      message,
      timestamp: new Date().toISOString(),
    });
  });

  client.on("connected", () => {
    console.log(`[twitch] connected to #${channel}`);
  });

  client.connect().catch(onError);

  return function stop() {
    client.disconnect().catch(() => {});
  };
}

module.exports = { startTwitchWatcher };
