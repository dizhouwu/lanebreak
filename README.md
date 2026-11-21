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
| Neris, Loomkeeper | Weaves ten spells from three-mark combinations and casts them from two slots |
| Cairn, Kiln Keeper | Ranged burst carry who builds Heat by last-hitting creeps |
| Ecarg, String Virtuoso | Bowed notes mark heroes for stronger follow-up spells |

Hover over a hero on the home screen to read their kit. Select a hero and open **Abilities** for the same reference on touchscreens. Open **Item guide** to search shop items by name, effect, or recipe component and compare their full prices.

Neris queues marks with **Q** (Thread), **W** (Needle), and **E** (Knot). Only the latest three count, in any order. **R** prepares the recipe in **D** and moves the previous spell to **F**. **D** and **F** cast the prepared spells and spend their mana. Each spell keeps its own cooldown when it changes slots or is prepared again. Neris uses **V** for potions.

| Marks | Spell |
|---|---|
| Q + Q + Q | Pin Stitch, a tag that lets follow-up hits briefly stagger a hero |
| Q + Q + W | Crosswind, a piercing line stun |
| Q + Q + E | Fray Screen, a persistent slow zone |
| Q + W + W | Loose End, a short teleport |
| Q + W + E | Spool Break, a wave that pushes enemies and disarms heroes |
| Q + E + E | Needle Post, a stationary sentry |
| W + W + W | Hollow Seam, a delayed mana drain |
| W + W + E | Tighten Thread, a temporary attack-speed and damage buff |
| W + E + E | Rolling Stitch, four bursts that advance in the cast direction |
| E + E + E | Sky Needle, a long-range delayed strike |

Cairn can use all three fixed-distance blasts from level one. **Q** lands 235 units ahead, **W** lands 460 units ahead, and **E** lands 700 units ahead. Turn Cairn with movement or an attack order, then press the ability key to cast along his facing. Each blast has its own cooldown. Last-hitting enemy creeps builds up to six Heat, each adding 3 attack damage. Death removes half the stored Heat. **R** spends all stored Heat for a stronger blast centered on the position where you cast it.

Ecarg's **Downbow** marks enemy heroes with Resonance. Land **Overtone** or **Grand Cadence** while the mark is active to consume it for extra damage and a short stun. **Countertempo** gives Ecarg a burst of movement and attack speed.

## Play solo

Open `lanebreak.html` in a desktop browser, choose a hero and difficulty, and click **Start match**. The HTML includes the rules, graphics, and sound and works offline.

| Action | Controls |
|---|---|
| Move, attack, transfer creep aggro, or deny | Right-click |
| Inspect unit health and hero items | Left-click |
| Toggle follow / recenter the free camera on your hero | C / Space |
| Pan in free camera mode | Arrow keys, middle-mouse drag, click or drag on the minimap, or move the cursor to a screen edge |
| Select a targeted ability / confirm it / cancel it | Ability key / left-click / right-click or Esc |
| Cast a self-targeted ability or prepare Neris's marks | Ability key |
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

## Training

Choose a hero and click **Training** on the home screen. Leave **Include a training dummy** checked to practice against a stationary target with unlimited health, or uncheck it for an empty arena. Training starts at level 15 with enough gold to experiment with equipment. Abilities have no mana cost or cooldown. Resources refill and item and recall cooldowns reset automatically. The damage counter keeps your session total.

Append `#training=neris` to jump straight into training with Neris. Add `&dummy=off` to start in an empty arena.

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
