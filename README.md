# Lanebreak

A browser strategy game with a one-lane 1v1 duel and a separate three-lane 5v5 battlefield. Last-hit creeps, contest river runes, and build items as you take down towers and the enemy core.

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

Neris queues marks with **Q** (Thread), **W** (Needle), and **E** (Knot). Only the latest three count, in any order. **R** prepares a new recipe in **D**, moves the previous spell to **F**, and starts a 0.5s base cooldown. Re-invoking a prepared recipe brings it to **D** immediately and preserves the current **R** timer. **D** and **F** cast the prepared spells and spend their mana. Each spell keeps its own cooldown when it changes slots or is prepared again. Neris uses **V** for potions.

| Marks | Spell |
|---|---|
| Q + Q + Q | Pin Stitch, an instant click on an enemy hero that staggers them and marks them for follow-up staggers |
| Q + Q + W | Veil Stitch, self-cast invisibility that ends when you attack or cast another spell |
| Q + Q + E | Frost Loom, an instant ice wall perpendicular to your facing. It slows enemies and deals damage each second. |
| Q + W + W | Crosswind, a click-aimed tornado that damages and briefly lifts enemies in its path |
| Q + W + E | Spool Break, a piercing shockwave that knocks enemies back along its path and disarms heroes |
| Q + E + E | Needle Post, a stationary sentry |
| W + W + W | Hollow Seam, a delayed mana drain |
| W + W + E | Tighten Thread, a temporary attack-speed and damage buff |
| W + E + E | Emberfall, a meteor that lands, rolls forward, and burns enemies in its path |
| E + E + E | Sky Needle, a long-range delayed strike |

Prepare **WWQ** and **WWW** before a fight. Lift the opponent with Crosswind, then time Hollow Seam to burst as they land. Prepare **EEW** for Emberfall, then **QWE** to push them along the rolling meteor's path. Emberfall can hit the same target again if the target stays with it.

For a Galeglass combo, prepare **EEE** in F and **EEW** in D. Lift the opponent with the scepter, cast Sky Needle from F with about one second left, then prepare **QWE** with R. Cast Emberfall from F with about half a second left. Aim Spool Break from D so it reaches the opponent just after the meteor lands. The shockwave's flight time depends on your distance.

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
| Show or hide teams, hero levels, and equipment | Backtick (<kbd>`</kbd>) |
| Change graphics / toggle sound | G / M |

The camera follows your hero at the start of each match. Press **C** to switch to free camera.

Order a basic attack on the enemy hero near enemy creeps to draw their aggro. Right-click or press **A** over a nearby allied creep to redirect enemy creeps that are attacking you. You can deny an allied creep when its health bar turns purple.

Click **End match** in a solo game to end your run early and see your stats. In an online game, confirm **Surrender** to award the opponent a win and show the result to both players.

Click an item name in the shop to expand its recipe and buy components individually. The recipe highlights components you own and deducts their value from the finished item's price. Use the gold button to buy an item or click an item in your inventory to sell it. After pausing a solo match, press **P** or **Esc**, or click the overlay to resume.

Follow **Builds into** to compare equipment upgrades. Gravemark Hammer builds toward Faultline Maul for a targeted stun. Spellward Mantle trades Mending Locket's heal for an allied spell barrier. Wayfarer's Spur turns Storm Striders into a combat reposition, and Wellsplitter adds mana burn and a targeted slow to Frost Brand. Press the item slot key, then click the appropriate hero or ground location. Rift Stone blinks toward the clicked point within its range.

Append `#play=brakk,hard` to the URL to start a match immediately, or append `#demo=brakk,normal,300` to spectate a bot match starting at the five-minute mark.

## Play 5v5

Choose **5v5** and select **Play with bots**, or host a private 5v5 room on a running server. Share the room code or invite link. The host can start at any time, and bots fill the remaining seats. Players can join either side or let the lobby balance the teams. A bot takes over an online player who disconnects.

Azure starts in the southwest and Crimson in the northeast. Each lane has its own outer and inner towers. Destroy both towers in any one lane to expose the enemy core. Enemy fountains fire high-damage beams at intruders. Press the backtick key (<kbd>`</kbd>) to compare hero levels and items across both teams.

In both 1v1 and 5v5, click **Fortify towers** to make every surviving allied tower invulnerable for 5 seconds. During that time each tower can shoot up to five enemy creeps in range per volley. Teammates share the 180-second cooldown.

While dead, click **Buyback** to spend 200 plus 50 gold per hero level and respawn immediately at your fountain with full health and mana. Buyback has a 240-second cooldown per hero.

## Training

Choose a hero and click **Training** on the home screen. Leave **Include a training dummy** checked to practice against a target with unlimited health. The dummy stays in place unless moved by an ability. Uncheck the option for an empty arena. Training starts at level 15 with enough gold to experiment with equipment. Abilities cost no mana and resources refill automatically. **Zero cooldowns** starts on. Turn it off to practice with normal ability, equipment, and recall cooldowns. Buy **Renewal Orb** to refresh abilities and other equipment actives while normal cooldowns are enabled. The damage counter keeps your session total.

Click **Change hero** during training to try another kit in the same arena. Your location, items, and session totals carry over. Active abilities, summons, and temporary statuses clear when you switch.

Append `#training=neris` to jump straight into training with Neris. Add `&dummy=off` to start in an empty arena.

## Run a two-player server

The build runs on Windows, macOS (Apple Silicon or Intel), and Linux. Install Node.js 22 or newer, stable Rust through [rustup](https://rustup.rs/), and the platform linker. Use the Visual Studio C++ build tools on Windows, the Xcode Command Line Tools on macOS, or your distribution's C compiler and build tools on Linux.

```sh
rustup target add wasm32-unknown-unknown
npm run build
npm start
```

The build compiles the Rust engine as a native add-on for the current operating system and embeds its WebAssembly build in the standalone game HTML. Build again on the destination platform when moving the server to another machine. On Windows, `Start-Lanebreak.cmd` builds and starts the server using the same tools.

For a test on one computer, open `http://127.0.0.1:8377/` in two browser tabs. Under **Online 1v1**, one player clicks **Host match** and the other opens the invite link or enters the four-letter room code and clicks **Join room**. Both players can also click **Find opponent**. To play from two devices on the same LAN, run `node lanebreak_server.js --host=0.0.0.0` and open the host's LAN address on port 8377 from the other device.

The server simulates the match at 60 Hz and sends snapshots at approximately 30 Hz. Refreshing the page reconnects to the match using the current tab's seat token. A bot takes over while the player is disconnected. Restarting the server clears active rooms.

## Deploy with Cloudflare Tunnel

Run `npm start` and `cloudflared` on the same host. In the tunnel's **Published application** settings, point the public hostname to `http://127.0.0.1:8377`. Keep the default loopback listener and preserve the public Host header through the tunnel. The HTTPS page connects automatically to `/ws` over a secure WebSocket on the same hostname.

Check `/healthz`, then use two devices to host, join, and reconnect after a refresh through the public hostname.

- [Cloudflare Tunnel setup](https://developers.cloudflare.com/tunnel/get-started/)
- [Cloudflare WebSocket documentation](https://developers.cloudflare.com/network/websockets/)

## Source and tests

`rust/engine` runs the match, including movement, damage, abilities, items, objectives, creeps, and AI. It uses `rust/physics` for collision and projectile queries and reads the shared hero, item, and difficulty tables from `src/rules.json`. The browser runs that engine through WebAssembly. The server loads the same engine through the native bindings in `rust/node` and handles rooms, reconnections, and WebSockets. JavaScript handles input, previews, and rendering.

The [cross-platform build](https://github.com/dizhouwu/lanebreak/actions/workflows/build.yml) checks Windows, Linux, Apple Silicon, and Intel macOS. After changing source or tuning tables, run `npm run build` and restart the server.

```sh
npm test
npm run balance
```

The tests cover hero abilities, recipes and refunds, active item cooldowns, denies, recall, match results, private rooms, public matchmaking, and reconnects. The rules and interface were reconstructed from screenshots. Source screenshots confirmed the Void Core recipe and stats. It costs 2,300 gold total (Arcane Core, Focus Rune, and 550 gold) and grants 40% ability damage, 320 mana, 3 mana per second, and 20% ability cooldown reduction. The bot match script measures hero balance and match length.
