# Live presence service

**English** | [简体中文](README.zh-CN.md)

This dependency-free Node.js SSE service powers the small online count in the
lower-left of the game. Each open SSE connection represents one browser tab.
The service keeps only an in-memory connection set and records no IP address,
account, gameplay data, or history.

## Local use

Node.js 20.19 or newer is required:

```bash
cd presence
npm test
npm start
```

The service listens on `127.0.0.1:8788` and exposes `GET /presence`. When the
Vite development server is also running, `/api/presence` is proxied to it.
`PRESENCE_HOST` and `PRESENCE_PORT` can override the defaults.

## Server deployment

1. Upload `presence/` to `/srv/select-from-dungeon/presence`.
2. Review [select-from-dungeon-presence.service](deploy/select-from-dungeon-presence.service),
   then install it under `/etc/systemd/system/`.
3. Add [nginx-location.conf](deploy/nginx-location.conf) to the HTTPS server
   block that already serves the game at `/game/`.
4. Enable the service and reload Nginx:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now select-from-dungeon-presence
sudo nginx -t
sudo systemctl reload nginx
```

Verify both paths with `curl -N http://127.0.0.1:8788/presence` and
`curl -N https://your-domain.example/game/api/presence`. The request remains
open because it is an event stream. If the service is unavailable, the game
continues to work and the indicator shows a gray dot with `—`.

This implementation supports one service instance. Multiple replicas would
require shared presence state.
