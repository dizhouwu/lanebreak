# Lanebreak

单路 1v1 推塔游戏。选择 Vesper、Brakk 或 Orrin，补刀、抢河道符文、合成装备，依次摧毁外塔、内塔和敌方核心。单机可选三个难度，联机可以邀请好友或排队匹配。

## 直接玩单机

用桌面浏览器打开 `lanebreak.html`，选择英雄和难度后点击 **Start match**。这个 HTML 自带规则、画面和声音，可以离线使用。

| 操作 | 按键 |
|---|---|
| 移动、攻击、转移小兵仇恨、反补 | 右键 |
| 查看单位血量和英雄装备 | 左键 |
| 切换自由镜头（开局默认）、回到英雄并跟随 | C / Space |
| 移动镜头 | 方向键、点击或拖动小地图、自由镜头下鼠标移到屏幕四边 |
| 释放技能 | Q / W / E / R |
| 使用装备主动效果 | 1–6 |
| 攻击光标下的目标或走 A、停止自动攻击 | A / S |
| 商店、药水、回城 | B / F / T |
| 单机暂停 | P / Esc |
| 画质、声音 | G / M |

靠近敌方小兵时，对敌方英雄下达普攻指令即可拉仇恨。右键或按 A 指向附近的己方小兵，可以把攻击你的敌方小兵转向它。己方小兵血条变紫时还可以反补。

商店里点击装备名称可展开合成树，直接购买中间件或基础零件。已持有的组件会高亮，也会自动从成品价格中抵扣。金色购买按钮可直接下单，点击背包中的装备可出售。单机暂停后可按 P、Esc 或点击画面继续。

地址末尾可以追加 `#play=brakk,hard` 直接开局，或追加 `#demo=brakk,normal,300` 观看模拟到第 5 分钟的电脑对局。

## 本地双人联机

需要 Node.js 22 或更新版本。解压后，在项目目录运行：

```sh
npm start
```

两人打开 `http://127.0.0.1:8377/`。一方在 **Online 1v1** 点击 **Host match**，另一方打开邀请链接或输入四位房间码后点击 **Join room**。也可以两人都点 **Find opponent**。同一台电脑可用两个标签页试跑。若两台设备在同一局域网，用 `node lanebreak_server.js --host=0.0.0.0` 启动，再从另一台设备打开主机的局域网 IP 和端口 8377。

服务器按 60 Hz 推进比赛，按约 30 Hz 发送快照。网页刷新后可用当前标签页的席位令牌自动重连，离线期间由电脑接手。服务器重启会清空进行中的房间。

## 以后部署到 Cloudflare

保留这个 Node.js 对战服务时，可以用 **Cloudflare Tunnel** 提供公网域名。把项目放到持续运行的主机，在同一台主机运行 `npm start` 和 `cloudflared`，然后在 Tunnel 的 **Published application** 里把域名指向 `http://127.0.0.1:8377`。继续使用默认回环监听，并让隧道保留请求的公网 Host。HTTPS 网页会自动连接同域的 `wss://…/ws`。

接通后，用 `/healthz` 检查服务，再用两台设备经公网域名建房、加入和刷新重连。

- [Cloudflare Tunnel 设置文档](https://developers.cloudflare.com/tunnel/get-started/)
- [Cloudflare WebSocket 文档](https://developers.cloudflare.com/network/websockets/)

## 源码与验证

`src/rules.js` 存放英雄、装备和难度数据，`src/engine.js` 供单机和对战服务器共用。`src/paint.js` 和 `src/client.js` 负责画面、输入和在线客户端。改完源码后运行 `npm run build` 重新生成单文件版，再重启服务器。

```sh
npm test
npm run balance
```

测试覆盖英雄技能、合成和退款、主动装备冷却、反补、回城、对局结算、私人房间、公开匹配和断线重连。依据截图重建了规则与界面。补充的源码截图确认了 Void Core 的属性：Arcane Core + Focus Rune + 550 金，总价 2,300 金，提供 40% 技能伤害、320 法力、每秒 3 法力回复和 20% 技能冷却缩减。电脑对战脚本可复测本版英雄强度和局长。
