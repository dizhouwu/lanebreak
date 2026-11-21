# Lanebreak

A one-lane 1v1 strategy game inspired by Dota 2's laning. Last-hit creeps, contest river runes, and build items as you take down the outer tower, inner tower, and enemy core. Play solo at one of three difficulty levels, invite a friend, or queue for an online match.

## Heroes

| Hero | Play style |
|---|---|
| Vesper, Tide Archer | Ranged pressure with piercing arrows and snares |
| Brakk, Iron Ram | Durable melee brawler with a charge and lifesteal |
| Orrin, Gravity Sage | Burst caster with delayed impacts and a blink |
| Sable, Glass Duelist | Mobile melee pressure with a dash and a piercing finisher |
| Mirel, Fen Warden | Ranged lane control with persistent zones and defensive sustain |
| Neris, Loomkeeper | Assembles a spell from a pair of marks at cast time |

Neris queues marks with **Q** (Thread), **W** (Needle), and **E** (Knot). Only the latest two count, in either order. **R** casts the resulting spell, spends its mana, and starts a shared cooldown with a base duration of seven seconds. You can prepare the next pair during the cooldown.

| Marks | Spell |
|---|---|
| Q + Q | Running Stitch, a piercing projectile |
| Q + W | Hemline, an area slow |
| Q + E | Loose End, a blink |
| W + W | Pincushion, three focused area hits |
| W + E | Anchor Stitch, a delayed area stun |
| E + E | Double Knot, temporary armor and healing |

## Play solo

Open `lanebreak.html` in a desktop browser, choose a hero and difficulty, and click **Start match**. The HTML includes the rules, graphics, and sound and works offline.

| Action | Controls |
|---|---|
| Move, attack, transfer creep aggro, or deny | Right-click |
| Inspect unit health and hero items | Left-click |
| Toggle follow / recenter the free camera on your hero | C / Space |
| Pan in free camera mode | Arrow keys, middle-mouse drag, click or drag on the minimap, or move the cursor to a screen edge |
| Cast abilities | Q / W / E / R |
| Use active items | 1–6 |
| Attack the target under the cursor or attack-move / stop attacking | A / S |
| Shop / potion / recall | B / F / T |
| Pause a solo match | P / Esc |
| Change graphics / toggle sound | G / M |

The camera follows your hero at the start of each match. Press **C** to switch to free camera.

Order a basic attack on the enemy hero near enemy creeps to draw their aggro. Right-click or press **A** over a nearby allied creep to redirect enemy creeps that are attacking you. You can deny an allied creep when its health bar turns purple.

Click **End match** in a solo game to end your run early and see your stats. In an online game, confirm **Surrender** to award the opponent a win and show the result to both players.

Click an item name in the shop to expand its recipe and buy components individually. The recipe highlights components you own and deducts their value from the finished item's price. Use the gold button to buy an item or click an item in your inventory to sell it. After pausing a solo match, press **P** or **Esc**, or click the overlay to resume.

Append `#play=brakk,hard` to the URL to start a match immediately, or append `#demo=brakk,normal,300` to spectate a bot match starting at the five-minute mark.

## Run a two-player server

Install Node.js 22 or newer and run this command in the project directory.

```sh
npm start
```

For a test on one computer, open `http://127.0.0.1:8377/` in two browser tabs. Under **Online 1v1**, one player clicks **Host match** and the other opens the invite link or enters the four-letter room code and clicks **Join room**. Both players can also click **Find opponent**. To play from two devices on the same LAN, run `node lanebreak_server.js --host=0.0.0.0` and open the host's LAN address on port 8377 from the other device.

The server simulates the match at 60 Hz and sends snapshots at approximately 30 Hz. Refreshing the page reconnects to the match using the current tab's seat token. A bot takes over while the player is disconnected. Restarting the server clears active rooms.

## Deploy with Cloudflare Tunnel

Run `npm start` and `cloudflared` on the same host. In the tunnel's **Published application** settings, point the public hostname to `http://127.0.0.1:8377`. Keep the default loopback listener and preserve the public Host header through the tunnel. The HTTPS page connects automatically to `/ws` over a secure WebSocket on the same hostname.

Check `/healthz`, then use two devices to host, join, and reconnect after a refresh through the public hostname.

- [Cloudflare Tunnel setup](https://developers.cloudflare.com/tunnel/get-started/)
- [Cloudflare WebSocket documentation](https://developers.cloudflare.com/network/websockets/)

## Source and tests

`src/rules.js` defines heroes, items, and difficulty settings. Solo and online modes share `src/engine.js`. Rendering lives in `src/paint.js`, and `src/client.js` handles input and online play. After changing the source, run `npm run build` to regenerate the standalone HTML, then restart the server.

```sh
npm test
npm run balance
```

The tests cover hero abilities, recipes and refunds, active item cooldowns, denies, recall, match results, private rooms, public matchmaking, and reconnects. The rules and interface were reconstructed from screenshots. Source screenshots confirmed the Void Core recipe and stats. It costs 2,300 gold total (Arcane Core, Focus Rune, and 550 gold) and grants 40% ability damage, 320 mana, 3 mana per second, and 20% ability cooldown reduction. The bot match script measures hero balance and match length.
