# ArcRaids Twitch Bot + Extension

A Twitch chat game and companion Extension for ARC Raiders. Players participate in timed raids, collect loot, earn Cred, and progress through titles while engaging in PvP vendettas and co-op interactions.

## Features

- **Automated Raid System**: Raids start every 15 minutes, run for 7 minutes
- **Loadout Selection**: PVP (high risk/reward), PVE (balanced), LOOTING (safer, more items)
- **Economy**: Sell items for Cred, spend on cash-ins and titles
- **PvP Vendettas**: Kill attribution system creates rivalries between players
- **Co-op Events**: Positive interactions between raiders
- **Titles**: Progression system with 13 ranks
- **Streamer-Honored Actions**: Manual redemptions for streamer to perform
- **Twitch Extension**: Panel UI for managing profile, inventory, and raids

## Setup

### Prerequisites

- Node.js 18+ and npm
- Twitch Developer Account
- Twitch Bot Account (separate from broadcaster account)

### 1. Install Dependencies

```bash
npm install
```

### 2. Twitch Bot Setup

1. Go to https://dev.twitch.tv/console/apps
2. Create a new application
3. Note the Client ID
4. Generate a User Access Token with scopes: `chat:read` and `chat:edit`
   - Use: https://twitchtokengenerator.com/ or Twitch CLI
5. Your bot account must be a moderator or have permission to chat in the channel

### 3. Twitch Extension Setup

1. Go to https://dev.twitch.tv/console/extensions
2. Create a new Extension (Panel type)
3. Note the Extension Secret (from Extension Settings)
4. Set the Extension Base URL to your EBS URL (e.g., `http://localhost:3000` for local dev)
5. For local development, use the Extension Developer Rig

### 4. Environment Variables

Create a `.env` file in the project root:

```env
# Twitch Bot
TWITCH_USERNAME=your_bot_username
TWITCH_OAUTH_TOKEN=oauth:your_token_here
TWITCH_CHANNEL=your_channel_name

# Database
DB_PATH=./data/arcraids.db

# Extension (EBS)
EXTENSION_SECRET=your_extension_secret_base64
EXTENSION_CLIENT_ID=your_client_id
BASE_URL=http://localhost:3000
PORT=3000
```

### 5. Run the Server

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

The bot will connect to Twitch IRC and start the raid scheduler.

### 6. Run the Extension (Development)

```bash
cd extension
npm install
npm run dev
```

Then use the Twitch Extension Developer Rig to load the extension panel.

## Commands

### Player Commands

- `!create <callsign>` - Create your character
- `!profile [username]` - View your profile or another player's
- `!join` - Join the current raid
- `!loadout <pvp|pve|looting>` - Set your loadout for current/next raid
- `!sell` - Sell all items in inventory for Cred
- `!cashin <option>` - Spend Cred on cash-in options (see below)
- `!titles` - List all titles and your progress
- `!buytitle` - Purchase the next available title
- `!settitle <title name>` - Set your active title
- `!vendetta [username]` - View vendetta stats or head-to-head record

### Broadcaster/Admin Commands

- `!redemptions` - List pending redemptions
- `!approve <redemptionId>` - Approve a redemption
- `!deny <redemptionId>` - Deny a redemption (refunds Cred)
- `!complete <redemptionId>` - Mark a redemption as complete

## Cash-In Options

### Automated (No Approval)

- `ping`, `ping2`, `ping3` - 250 Cred each (60s cooldown)
- `shoutout` - 1,000 Cred
- `scout` - 1,500 Cred
- `insure` - 5,000 Cred
- `event` - 7,500 Cred (next raid modifier)
- `reroll` - 15,000 Cred (reroll last raid)
- `mvp` - 20,000 Cred (MVP tie-break advantage)

### Streamer-Honored (Requires Approval)

- `shoot` - 500 Cred - Streamer shoots weapon in game
- `drop_shields` - 750 Cred - Streamer drops all shield rechargers
- `prox_chat` - 1,000 Cred - Streamer keeps proximity chat on rest of raid
- `instigate` - 2,000 Cred - Streamer instigates a fight with next raider
- `stella_montis_full` - 35,000 Cred - Streamer does full loadout (80k cred minimum) into Stella Montis for >=15 minutes

## Title Progression

Titles are purchased sequentially and cost Cred:

- **Rookie I**: Free (auto-granted on creation)
- **Rookie II**: 2,500 Cred
- **Rookie III**: 5,000 Cred
- **Tryhard I**: 10,000 Cred
- **Tryhard II**: 15,000 Cred
- **Tryhard III**: 20,000 Cred
- **Wildcard I**: 30,000 Cred
- **Wildcard II**: 40,000 Cred
- **Wildcard III**: 50,000 Cred
- **Daredevil I**: 65,000 Cred
- **Daredevil II**: 80,000 Cred
- **Daredevil III**: 100,000 Cred
- **Hotshot**: 150,000 Cred
- **Cantina Legend**: Manual award only (not purchasable)

## Game Mechanics

### Raid Cycle

- Raids start automatically every 15 minutes
- Each raid runs for 7 minutes (OPEN state)
- Players can join and change loadouts until T-60s (loadout lock)
- After 7 minutes, raid enters RESOLVE state
- Results are calculated, loot distributed, and announcements made

### Extract Chance

Base: 60%

Modifiers:
- **PVP**: -20% extract chance, +40% value multiplier
- **PVE**: Baseline
- **LOOTING**: +5% extract chance, +15% item count, -10% value multiplier
- **FREE** (first raid): -25% extract chance, -20% value multiplier
- **Map**: ±1% cap based on difficulty
- **Co-op bonus**: +1% per co-op event (max +2%)

Final chance clamped between 5% and 95%.

### Loot System

- **Hard Caps**:
  - Max 8 items per successful extract
  - Max 5,000 Cred value per raid
- **Tier Distribution**:
  - Common: 60% (PVP: 30%)
  - Rare: 30% (PVP: 40%)
  - High: 10% (PVP: 30%)

### PvP Kill Attribution

- Only PVP raiders who EXTRACTED can be credited with kills
- 35% chance per death to attribute to a random extracted PVP raider
- Max 5 kill messages per raid to avoid spam
- Tracks head-to-head records for vendettas

### Co-op Events

- 0-3 events per raid, weighted toward PVE/LOOTING participants
- Types: covered extraction, shared ammo, helped with ARC threat
- Provides tiny extract chance bonus (+1% per event, max +2%)

## Rate Limits

The bot enforces Twitch rate limits:

- **Global**: 20 messages per 30 seconds
- **Per-channel**: 1 message per second

Messages are queued and sent with priority. High-priority messages (raid announcements) are sent first.

## Database

Uses SQLite with better-sqlite3. Database file location: `./data/arcraids.db` (configurable via `DB_PATH`).

Schema includes:
- `users` - Player profiles and stats
- `titles` - Title definitions
- `owned_titles` - Player title ownership
- `inventory` - Player items
- `raids` - Raid history
- `raid_participants` - Raid participation records
- `redemptions` - Cash-in redemptions
- `kills` - PvP kill ledger
- `kill_events` - Kill event history
- `maps_cache` - Map configurations

## Extension API Endpoints

### Public

- `GET /api/public/profile/:twitchName` - Get public profile
- `GET /api/public/vendetta/:a/:b` - Get head-to-head stats
- `GET /api/raid/current` - Get current raid status

### Authenticated (Requires Extension JWT)

- `GET /api/me/profile` - Get own profile
- `GET /api/me/inventory` - Get own inventory
- `POST /api/me/join` - Join current raid
- `POST /api/me/loadout` - Set loadout
- `POST /api/me/sell` - Sell all items
- `POST /api/me/cashin` - Cash in
- `GET /api/me/titles` - Get titles
- `POST /api/me/titles/buy` - Buy next title
- `POST /api/me/titles/set` - Set active title

### Admin (Requires Extension JWT)

- `GET /api/admin/redemptions` - List pending redemptions
- `POST /api/admin/approve` - Approve redemption
- `POST /api/admin/deny` - Deny redemption
- `POST /api/admin/complete` - Complete redemption

## Testing

Unit tests use Jest with seedable RNG for deterministic testing:

```bash
npm test
```

Test coverage includes:
- Extract chance calculations and clamping
- Map extract modifier caps
- Encounter weighting
- Raid hard caps
- Economy operations
- Cash-in system
- Title progression
- Kill attribution
- Vendetta stats

## Development

### Project Structure

```
/
├── server/
│   ├── src/
│   │   ├── bot/          # Twitch IRC bot
│   │   ├── game/         # Game logic (raids, economy, etc.)
│   │   ├── db/           # Database schema and repository
│   │   ├── http/         # EBS API endpoints
│   │   ├── config.ts     # Configuration
│   │   └── index.ts      # Entry point
│   └── data/seed/        # Seed data (items, maps, lore)
├── extension/
│   └── src/              # React Extension panel
└── README.md
```

### Adding New Items

Edit `server/data/seed/weapons.json` or `server/data/seed/arc_items.json` and restart the server.

### Adding New Maps

Edit `server/data/seed/maps.json` with:
- `name`: Map name
- `difficultyScalar`: 0.90-1.10 (affects extract chance, ±1% cap)
- `encounterBias`: -1, 0, or +1 (affects encounter count, clamped 0-3)

### Adding Lore Snippets

Edit `server/data/seed/lore_snippets.json` with short flavor text (10-30 lines recommended).

## Troubleshooting

### Bot not connecting

- Verify `TWITCH_OAUTH_TOKEN` is valid and has `chat:read` and `chat:edit` scopes
- Check bot account is not banned from channel
- Ensure bot username matches token owner

### Extension not loading

- Verify `EXTENSION_SECRET` is correct (base64 encoded)
- Check `BASE_URL` matches your EBS URL
- Ensure Extension Developer Rig is configured correctly
- Check browser console for JWT validation errors

### Rate limit errors

- Bot automatically queues messages and respects rate limits
- If seeing errors, check for message spam in code
- Reduce announcement frequency in config

## License

MIT

## Credits

- ARC Raiders lore and world from https://arcraiders.wiki/
- Built with tmi.js, better-sqlite3, React, and Twitch Extensions API
