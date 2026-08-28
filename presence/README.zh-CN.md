# 实时在线人数服务

[English](README.md) | **简体中文**

这是游戏左下角在线人数指示器的无状态 Node.js SSE 服务。每条已打开的 SSE 连接计为一个
浏览器标签页；服务只保存内存中的连接集合，不记录 IP、账号、游戏数据或历史信息。

## 本地运行

需要 Node.js 20.19 或更高版本，不需要安装依赖：

```bash
cd presence
npm test
npm start
```

服务默认监听 `127.0.0.1:8788`，接口为 `GET /presence`。同时运行 `pnpm --dir game dev` 时，
Vite 会把浏览器请求的 `/api/presence` 转发到该接口。

可通过环境变量修改监听地址和端口：

```bash
PRESENCE_HOST=127.0.0.1 PRESENCE_PORT=8788 npm start
```

## 服务器部署

1. 把整个 `presence/` 目录上传到 `/srv/select-from-dungeon/presence`，确认 `/usr/bin/node`
   指向 Node.js 20.19 或更高版本。
2. 检查 [select-from-dungeon-presence.service](deploy/select-from-dungeon-presence.service) 中的
   `User`、目录和 Node 路径，再复制到 `/etc/systemd/system/`。
3. 把 [nginx-location.conf](deploy/nginx-location.conf) 中的 `location` 加入现有 HTTPS
   `server` 块；该规则假设游戏地址为 `https://你的域名/game/`。
4. 重新加载服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now select-from-dungeon-presence
sudo nginx -t
sudo systemctl reload nginx
```

检查服务和代理：

```bash
systemctl status select-from-dungeon-presence
curl -N http://127.0.0.1:8788/presence
curl -N https://你的域名/game/api/presence
```

`curl` 会持续等待 SSE 数据，这是正常行为。每建立一个连接，返回的 `count` 会增加；关闭连接后
会减少。若停止该服务或移除 Nginx 代理，游戏仍可运行，但左下角会显示灰点和 `—`。

本实现只支持单个服务实例。部署多个实例会各自统计连接，不能得到全局人数。
