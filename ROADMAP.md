# Roadmap

Not a plan, more of a direction. One small thing per evening.

Six moods, each eventually with its own life. The Rain and Music ones get the most love —
rain on the glass and a lo-fi hum are the nicest things to sit inside — but they stay
two atmospheres in one shared room.

## The next eight weeks

Each evening starts with the current room and recent commits. Choose one complete,
visible improvement or a worthwhile repair; this direction can change as the room grows.

- Week 1: settle into the unified room — window controls, small screens, readable audio states.
- Week 2: life beyond the glass — rooftops, occasional lit windows, distant traffic and weather details.
- Week 3: a better listening evening — curated tapes, favourites, clear source credits and resilient streams.
- Week 4: objects on the desk — light settings, tea rituals and occasional subtle interactions.
- Week 5: each mood gets its own character — stars, soft sleep lighting, breathing and focus details.
- Week 6: evenings remembered — journal browsing, gentle local traces and useful personal preferences.
- Week 7: smoother everyday use — keyboard navigation, touch controls, reduced motion and performance.
- Week 8: revisit the whole room — visual coherence, sound balance, documentation and a rare secret.

Keep the stack small. Ship two or three meaningful commits for a completed session;
avoid changes whose only purpose is filling a day.

## Foundations
- [x] night screen, live clock, typography
- [x] mood selector with six atmospheres
- [x] smoother palette transitions between moods
- [ ] per-mood background details
- [x] keyboard shortcuts: 1–6 for moods, [ ] for rain strength
- [x] space starts and pauses the focus timer

## Rain mood
- [x] animated rain layer: drops falling over the page
- [x] drops sliding down the "glass", with trails
- [x] window fog that slowly gathers at the edges
- [x] blurred night-city lights behind the window (bokeh)
- [x] rain intensity: drizzle / steady / downpour
- [x] rare, very soft distant lightning in the city glow
- [x] real rain recordings, one per intensity, with an honest retry when unavailable

## Music mood
- [x] choose a recording by name and remember the selected tape between visits
- [x] save favourite tapes locally and let Next cycle through the saved collection
- [x] changing recordings preserves rain; late playback failures cannot replace a new tape
- [x] lo-fi player bar: play / pause, next, tape title, a small moving wave
- [x] real tracks streamed from the Internet Archive, synth as a fallback
- [x] a radio station: Lofi Girl's live stream
- [x] more radio channels: lofi house, synthwave, summer lofi, deep sleep
- [x] tape hiss / vinyl crackle layer
- [x] a volume knob for the tape, and arrow keys to match
- [x] separate volume for music and ambience
- [x] slow cassette reels turn while playing
- [x] lo-fi + real rain: simultaneous layers, independent volume, remembered weather
- [x] weather changes preserve radio playback; stale recording errors are ignored

## Other moods
- [x] Calm: slow breathing light
- [x] Focus: 25:00 timer with start / pause / reset
- [x] Focus: presets 15 / 25 / 45 / 60
- [x] Focus: a soft progress line follows the session
- [x] Focus: a quieter finish than a blank 00:00
- [x] Space: drifting stars, warm and cold, a rare shooting star
- [x] Space: parallax on the star field
- [x] Sleep: the room dozes off if you leave it alone

## Ambient
- [ ] ambient cards: Rain, Ocean, Fireplace, Space, Cafe, Night City
- [ ] local audio loops with soft fade in/out

## Evening rituals
- [x] daily vibe line, one per night
- [x] tiny journal: a mood chip and one sentence
- [x] journal: a discreet character count and accessible mood selection
- [x] journal: thumb-sized mobile chips and a compact note status
- [x] journal: multiline notes, immediate saves and visible storage errors
- [x] browser regressions for journal saving, midnight and narrow screens
- [x] previous nights: dated notes and emotions, newest first, seven at a time
- [x] history: keyboard navigation, safe text rendering and mobile layout checks
- [x] everything stored in localStorage

## Traces
- [x] nights visited, focus sessions, minutes focused
- [x] gentle streak counter

## Always
- [x] the window seat: illustrated night city, live clock, rain and passing train
- [x] interactive desk lamp, warm room light and a steaming cup
- [x] one continuous room: window, mood controls, audio and journal on the same page
- [x] start and pause a lo-fi tape with real rain directly at the window
- [x] the same sky changes warmth, light and city visibility with the chosen mood
- [x] individual apartment lights slowly change; Sleep puts the neighbours to bed
- [x] city life pauses in hidden tabs, Space and reduced motion
- [x] occasional flight across the window and softly glowing rooftop beacons
- [x] a detailed four-car night express on an elevated railway, with warm windows and a headlight
- [x] visible official radio, accessible inactive panels and responsive desk layout
- [x] another view from the window: moonlit mountains and a quiet lake
- [x] the landscape is remembered independently of mood and audio playback
- [ ] a third view: rooftops or the last café open
- polish, animation, micro-interactions
- [x] a proper pass over the phone layout: wrapping, thumb-sized controls
- new atmospheres and phrases
- the occasional easter egg (one is in, go find it)
