# YouTube + Twitch Live Chat Viewer

Watches a YouTube live stream's chat and a Twitch channel's chat at the same time,
printing every message to your terminal, prefixed with the platform and timestamp.

## Setup

```bash
npm install
cp .env.example .env
```

Then edit `.env`:

- **YouTube**: set either:
  - `YOUTUBE_VIDEO_ID` — the id from a live video's URL (`youtube.com/watch?v=THIS_PART`), or
  - `YOUTUBE_CHANNEL_ID` — the script will look up whatever that channel is currently streaming live.
- **Twitch**: set `TWITCH_CHANNEL` to the channel name (no `#`). This is enough for
  read-only anonymous chat viewing. If you also want to eventually send messages,
  fill in `TWITCH_USERNAME` and `TWITCH_OAUTH_TOKEN` (get a token from
  https://twitchtokengenerator.com). To refresh an expiring access token at startup,
  set `TWITCH_OAUTH_REFRESH` with the refresh token from
  https://twitchtokengenerator.com. The app calls TwitchTokenGenerator's refresh
  API before connecting. Twitch may rotate the refresh token, so replace
  `TWITCH_OAUTH_REFRESH` with the newest `refresh_token` returned by the service
  when that happens.
- **Kick**: set `KICK_CHANNEL` to the public channel slug. Kick chat is read in
  anonymous read-only mode, so no Kick credentials are required.

## Run

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000) to view the merged browser chat. The terminal output remains available, and the browser view reconnects automatically if the server connection drops.

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

- YouTube chat uses the public `youtube-chat` transport and does not consume
  YouTube Data API quota. It is an unofficial endpoint and may break if YouTube
  changes its internal chat response format.
- Twitch chat connects over IRC via `tmi.js` in real time, no polling needed.
- If a YouTube video isn't currently live, `getActiveLiveChatId` will throw a
  clear error instead of silently failing.
