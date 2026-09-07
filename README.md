# YouTube + Twitch Live Chat Viewer

Watches a YouTube live stream's chat and a Twitch channel's chat at the same time,
printing every message to your terminal, prefixed with the platform and timestamp.

## Setup

```bash
npm install
cp .env.example .env
```

Then edit `.env`:

- **YouTube**: create an API key in [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
  with the **YouTube Data API v3** enabled, and put it in `YOUTUBE_API_KEY`.
  Then set either:
  - `YOUTUBE_VIDEO_ID` — the id from a live video's URL (`youtube.com/watch?v=THIS_PART`), or
  - `YOUTUBE_CHANNEL_ID` — the script will look up whatever that channel is currently streaming live.
- **Twitch**: set `TWITCH_CHANNEL` to the channel name (no `#`). This is enough for
  read-only anonymous chat viewing. If you also want to eventually send messages,
  fill in `TWITCH_USERNAME` and `TWITCH_OAUTH_TOKEN` (get a token from
  https://twitchtokengenerator.com).

## Run

```bash
npm start
```

Example output:

```
[twitch] connected to #somechannel
Watching chat... press Ctrl+C to stop.
[10:32:01 AM] (youtube) Alice: hey everyone!
[10:32:03 AM] (twitch) Bob: pog
[10:32:05 AM] (youtube) Carol: nice stream
```

Press `Ctrl+C` to stop both watchers.

## Notes

- YouTube chat is polled (not a websocket) — the API tells the client how often to
  poll (`pollingIntervalMillis`), usually every few seconds. This does consume
  YouTube Data API quota; polling a busy chat for a long time can add up, so
  keep an eye on your quota in Google Cloud Console.
- Twitch chat connects over IRC via `tmi.js` in real time, no polling needed.
- If a YouTube video isn't currently live, `getActiveLiveChatId` will throw a
  clear error instead of silently failing.
