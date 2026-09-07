const tmi = require("tmi.js");

const TWITCH_REFRESH_URL = "https://twitchtokengenerator.com/api/v2/tokens/refresh";

async function refreshTwitchToken({ refreshToken }) {
  if (!refreshToken) {
    throw new Error("TWITCH_OAUTH_REFRESH is required to refresh a Twitch token.");
  }

  const response = await fetch(TWITCH_REFRESH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const data = await response.json();

  if (!response.ok || !data.access_token) {
    throw new Error(`TwitchTokenGenerator refresh failed: ${data.message || response.statusText}`);
  }

  return data;
}

/**
 * Connect to a Twitch channel's chat and stream messages.
 * Works anonymously (read-only) if no username/token is given.
 * Returns a stop() function.
 */
async function startTwitchWatcher({ channel, username, oauthToken, oauthRefresh }, onMessage, onError) {
  if (!channel) {
    onError(new Error("TWITCH_CHANNEL is not set — skipping Twitch chat."));
    return () => {};
  }

  try {
    if (oauthRefresh) {
      const refreshed = await refreshTwitchToken({ refreshToken: oauthRefresh });
      oauthToken = refreshed.access_token;
      console.log("[twitch] OAuth access token refreshed");
    }
  } catch (err) {
    onError(err);
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

module.exports = { refreshTwitchToken, startTwitchWatcher };
