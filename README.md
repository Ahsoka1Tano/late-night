# Late Night

A tiny digital room for quiet evenings.

**[Open it →](https://ahsoka1tano.github.io/late-night/)**

Open it late, pick a mood, sit for a bit, close it.
No accounts, no backend, no notifications — just a dark little corner of the internet.

## Right now

- a slow night screen with a live clock
- six atmospheres: Calm, Music, Focus, Rain, Space, Sleep
- real rain falling past the window, with drops sliding down the glass
- out-of-focus city lights behind it, drifting as you move
- a slow star field in the space mood, and once in a long while something crosses it
- a tape deck in the music mood: twenty hours of freely licensed tapes,
  or five of Lofi Girl's radio channels in her own player;
  if a stream is out of reach, a small synth keeps the room humming
- a calm mood that breathes: a slow glow in, a slower glow out
- a sleep mood that dozes off on its own if you stop touching anything
- drizzle, steady or downpour — heavy rain blurs the city away
- and you can hear it too: the rain sound is generated, not recorded,
  and thickens as the rain does
- a focus timer that lives inside the focus mood: 15, 25, 45 or 60 minutes,
  ending with a quiet line instead of an alarm
- the countdown shows in the tab title, so it keeps you company from another window
- one quiet line for tonight, the same all evening, a different one tomorrow
- a tiny journal: how the day was, and one line about tonight
- a faint line of traces at the bottom: nights here, evenings in a row,
  finished sessions and minutes focused
- the room remembers the mood you left it in

## Keys

| key | what it does |
| --- | --- |
| `1` … `6` | pick a mood |
| `[` `]` | softer / harder rain |
| `space` | start or pause the focus timer |
| `↑` `↓` | tape volume, in the music mood |

## Running it

No build step. Open `index.html`, or serve the folder:

```bash
python -m http.server 5173
```

Then visit <http://localhost:5173>.

## The tapes

Nothing is hosted here. The tape side streams from the Internet Archive:

| tape | licence |
| --- | --- |
| Lofi Lion — Tame the Beast | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Uplifting Pills — Chill Pill 11, 17, 19 | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) |

The radio side is [Lofi Girl](https://www.youtube.com/@LofiGirl)'s own live streams —
lofi hip hop, lofi house, synthwave, summer lofi and deep sleep — embedded with
YouTube's own player. Her stream ids change when she restarts a broadcast.

The fallback hum is generated in the browser with the Web Audio API.

## Stack

HTML, CSS, vanilla JS. On purpose.

Nothing leaves the browser: the mood, the journal and the settings live in `localStorage`,
there is no account, no server and nothing to sign up for.

## Roadmap

See [ROADMAP.md](ROADMAP.md) — it grows a little every evening.
