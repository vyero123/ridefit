# Piano Trainer

A browser-based piano practice trainer. It listens to an acoustic or digital
piano through the device microphone, works out what note was played and when,
and checks it against an exercise.

**This is Phase 1: the foundation.** What works today is pitch detection, onset
detection, a live "what am I hearing" readout, latency measurement and
calibration, and single-note staff rendering with immediate feedback. Timed
note sequences, scrolling notation and backing instrumentation are deliberately
not built yet, but the structure anticipates them.

---

## Running it

The app needs a **secure context** for microphone access. That means HTTPS, or
`http://localhost` — which browsers treat as secure. Opening `index.html` as a
`file://` URL will not work; `getUserMedia` is simply absent there.

**Deployed:** <https://ride-fit.netlify.app> — Netlify serves this repo's root
on every push to `main`. No build step: the files you see are the files served.

**Locally:**

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

To test on a phone, use the deployed URL. A laptop's `localhost` is not your
phone's `localhost`, and a plain `http://192.168.x.x` address is not a secure
context, so the microphone will not start.

**Tests:**

```bash
node tests/dsp-test.mjs        # pitch and onset DSP
node tests/tracker-test.mjs    # played-note hysteresis and enharmonic spelling
```

These run the real shipped modules against synthesised input — no browser, no
microphone, no second copy of the algorithm. They have already earned their
keep: the DSP suite caught an octave-halving bug and a false-retrigger bug in
the onset detector that would have been miserable to diagnose by ear.

```
open tests/browser-test.html   # served over http, not file://
```

The browser suite loads the real app in an iframe, injects synthesised piano
tones at exactly the point the microphone would attach, and drives it through
real tab switches. It is the regression test for the Practice-tab bug described
under *One pipeline, many views* below: it asserts that note events keep
arriving after switching away and back, and that the worklet node, the source
node and the AudioContext are the *same objects* afterwards, not merely working
replacements. Live copy: <https://ride-fit.netlify.app/tests/browser-test.html>

---

## First run, in order

1. **Listen tab → Start listening.** Grant the microphone. Play some notes; the
   big note name should respond within a beat or so of striking a key.
2. **Check the cents needle.** If everything reads consistently sharp or flat,
   your piano is not at A=440. Open *Detector settings* and move the tuning
   reference until the needle centres on notes you trust.
3. **Latency tab → Run calibration.** Four counting-in clicks, then twelve more;
   play any single note exactly on each. This is not optional — until it is
   done, nothing that scores timing has a meaningful reference.
4. **Practice tab.** Pick an exercise and play the highlighted note.

On the Practice tab there are two marks on the staff, in two columns:

- **blue, left column** — the note that is written, the one to play;
- **violet, right column** — the note you are actually playing, for as long as
  it is sounding;
- **green** — the written note, once you have matched it.

They are separate columns on purpose. If the played note were drawn on top of
the target, then playing the right note would hide it under an identical mark
and you could not tell a match from a miss.

---

## One pipeline, many views

There is exactly one `AudioContext`, one microphone stream, one worklet and one
input source for the life of the page. They are created by the Start button and
destroyed by the Stop button, **and by nothing else**. Switching tabs does not
create, destroy, connect, disconnect, suspend or resume anything.

Views are observers (`js/views/*.js`). Each subscribes to the session when it
becomes visible and unsubscribes when it is hidden, and that is the entire
extent of its power. A view that forgets to unsubscribe leaks a little work; a
view that forgets to subscribe shows nothing. Neither can stop the audio.

The session (`js/app/session.js`) also keeps a **permanent internal subscriber**,
registered once and never removed, which updates the liveness counters and the
played-note model. That is what makes "is it still listening?" a question with
a checkable answer rather than something you infer from whether the UI happens
to be moving — which is exactly what was missing when the Practice tab looked
dead. The counters are visible under *Latency → Input pipeline*, including how
many frames and notes have arrived since the last tab change, and
`session.assertLive()` reports any problem it can detect. `switchTab()` calls it
on every tab change and logs loudly if the graph has gone missing.

---

## The exercise data format

Exercises are **data, not code**. Adding a drill means writing a JSON file and
adding its filename to `exercises/index.json`. Nothing in `js/` needs to change.

### `exercises/index.json`

```json
{
  "files": ["middle-c-neighbours.json", "my-new-drill.json"]
}
```

Order is preserved in the exercise picker. A bare array of filenames also works.

### An exercise file

```json
{
  "schemaVersion": 1,
  "id": "my-new-drill",
  "title": "Thirds in the right hand",
  "description": "Shown under the picker. Say what the drill is for.",

  "clef": "treble",
  "tempo": 72,
  "timeSignature": [4, 4],
  "keySignature": 0,
  "preferFlats": false,

  "tolerance": {
    "cents": 50,
    "timingMs": 120,
    "octaveStrict": true
  },

  "tags": ["thirds", "right hand"],

  "notes": [
    { "pitch": "C4", "beat": 0, "duration": 1 },
    { "pitch": "E4", "beat": 1, "duration": 1 },
    { "pitch": "Bb4", "beat": 2, "duration": 2, "hand": "right" }
  ]
}
```

### Top-level fields

| Field | Type | Default | Meaning |
|---|---|---|---|
| `schemaVersion` | number | `1` | Bump only when the format changes. A file claiming a newer version than the app knows is rejected loudly rather than half-read. |
| `id` | string | filename | Stable identifier. Used in the picker and in note element ids. |
| `title` | string | `"Untitled exercise"` | Shown in the picker. |
| `description` | string | `""` | Shown under the picker. |
| `clef` | `"treble"` \| `"bass"` \| `"grand"` | `"grand"` | Which staff or staves to draw. |
| `tempo` | number | `72` | Beats per minute. Unused in Phase 1 scoring; the metronome and the timed phases will use it. |
| `timeSignature` | `[beats, beatUnit]` | `[4, 4]` | Currently metadata only. |
| `keySignature` | number −7…7 | `0` | Sharps positive, flats negative. Not yet drawn; it does switch default note spelling to flats when negative. |
| `preferFlats` | boolean | derived | Forces enharmonic spelling. Defaults to `true` when `keySignature` is negative. |
| `tolerance.cents` | number | `50` | How far off pitch still counts. 50 is "nearest semitone wins", which is the right setting for a piano — you cannot play out of tune on one. Tighten it only if you are using this to check a piano's tuning. |
| `tolerance.timingMs` | number | `120` | How far from the beat still counts. Reserved for the timed phases. |
| `tolerance.octaveStrict` | boolean | `true` | When `false`, any octave of the right pitch class is accepted. Useful for pitch-class drills; also a decent fallback for the bottom octave, where octave errors are likeliest. |
| `tags` | string[] | `[]` | Free-form. Not yet used for filtering. |
| `notes` | array | required | Must be non-empty. |

### Note fields

| Field | Type | Default | Meaning |
|---|---|---|---|
| `pitch` | string or number | required | `"C4"`, `"F#3"`, `"Bb5"`, `"Ebb2"`, `"Fx4"` (double sharp), or a raw MIDI number like `60`. Middle C is `C4` = MIDI 60. Must be inside the 88-key range, MIDI 21–108. |
| `beat` | number | previous note's end | Position in quarter-note beats from the start. Omit it and notes simply follow one another. |
| `duration` | number | `1` | Length in quarter-note beats. |
| `accidental` | `"sharp"` \| `"flat"` \| `"natural"` \| `"none"` \| omitted | derived from the pitch | Forces what is drawn. Use `"natural"` to show a natural sign, `"none"` to suppress an accidental the spelling would otherwise produce. |
| `spelling` | `{ letter, alter, octave }` | derived | Overrides how the note is placed and drawn without changing which key it is. This is how you get G♭4 rather than F♯4 for the same black key: same `pitch`, different `spelling`. |
| `hand` | `"left"` \| `"right"` \| `null` | `null` | Advisory. Not used in Phase 1. |
| `clef` | `"treble"` \| `"bass"` \| `null` | `null` | In `"grand"` mode, forces a note onto a particular staff. Without it, MIDI ≥ 60 goes on the treble staff. Middle C is the case that needs this. |
| `label` | string | `null` | Free text for a future annotation layer. |

### Validation

`js/exercises/loader.js` validates strictly and reports the exact note index
that is wrong. A malformed file is skipped with a console warning and the
picker says how many failed — it never fails silently at practice time.

---

## How pitch detection works, and where it does not

### The method

**McLeod Pitch Method (MPM)**, running in an `AudioWorklet`. A 4096-sample
window (85 ms at 48 kHz) is analysed every 1024 samples, so the readout updates
about 47 times a second.

The reason this is not an FFT peak-picker: on a piano the fundamental is
routinely 10–20 dB *weaker* than the second or third partial. A spectral peak
picker grabs the loudest partial and confidently reports the wrong octave. MPM
works in the time domain on the Normalised Square Difference Function, which
peaks at the true period no matter which partial is loudest.

The reason it is MPM and not YIN — they are close cousins and either would
work — is that MPM's NSDF is normalised into [−1, 1] and its peak height at the
chosen lag is directly usable as the confidence number shown in the UI.

The key-maximum threshold (take the *first* key maximum reaching 0.9 × the
tallest) is what prevents a dominant second partial from winning. It is also
subtle: an earlier version added an extra "prefer the lower octave" rule on top
of it, which sounds sensible and is completely wrong, because the NSDF peaks at
*every* multiple of the true period with nearly equal height, so such a rule
fires every time and reports everything an octave flat. `tests/dsp-test.mjs`
exists partly to keep that mistake from coming back.

### Where it degrades — honestly

- **The bottom octave.** Reliable detection wants roughly 2.5 periods inside
  the analysis window. At 48 kHz with the default 4096-sample window that puts
  the practical floor around 30 Hz, so A0–C1 are marginal and will drop out or
  read erratically. *Long window (8192 samples)* in Detector settings fixes the
  range at the cost of roughly doubling the time to a confident reading. Use it
  below about C2 and turn it off again afterwards.
- **The sustain pedal.** MPM assumes a single periodic source. Overlapping
  decaying notes drive the confidence figure down and can produce a pitch
  somewhere between two sounding notes. The confidence readout is the honest
  signal here — when it sags, the app genuinely does not know.
- **Fast repeated notes.** Two strikes closer than about 45 ms are merged; that
  is the minimum inter-onset gap. Well beyond normal playing, but real for a
  trill or a tremolo.
- **Very high notes.** Above roughly C7 there are few samples per period and
  little harmonic content, so cents readings wobble by several cents even when
  the note itself is right.
- **Inharmonicity.** Real piano strings are stiff, so their partials sit
  progressively sharp of exact multiples of the fundamental. Any period-based
  detector locks onto the period implied by that stretched series and therefore
  reads a few cents sharp — about 6¢ for a typical string, more in the bass of
  a small piano. This is physics, not a bug, and `tests/dsp-test.mjs` pins the
  behaviour down so nobody "fixes" it later. If it bothers you, the tuning
  reference slider absorbs it.
- **Monophonic, full stop.** Play two notes together and you get one answer,
  probably the louder one, with low confidence. Polyphony needs a different
  algorithm, not a tweak to this one.

### Onsets are detected separately, on purpose

Note onsets come from **spectral flux with an adaptive median threshold**, a
completely separate path from pitch tracking. This matters: if you infer note
events from pitch alone, playing the same note twice in a row reads as one long
held pitch. Spectral flux sees the second attack as a burst of new energy and
fires a second event.

The detector has hysteresis — it re-arms only after flux falls well back below
threshold. Without that, a single attack fires an onset on every frame until
the running median catches up, because the median is still dominated by the
silence before the note. That was the second bug the test suite caught.

---

## The note you are playing

The violet mark shows whatever the detector currently hears, at its correct
staff position, with ledger lines, and — on a grand staff — on whichever stave
suits the pitch.

### It tracks sustain rather than flashing

An onset tells you a note *started*. Nothing tells you it stopped: a piano note
decays continuously, so there is no moment where the sound switches off, only a
confidence figure sliding down towards noise. Lighting the staff on an onset
and clearing it on a fixed timer would produce a display with no relationship
to what you are hearing — a note held under the pedal would go dark while still
ringing, a staccato note would stay lit long after it had gone.

So the note is held for as long as the detector keeps finding it, and letting
go is deliberately made harder than grabbing on (`js/practice/played-note.js`):

| | |
|---|---|
| **attack** | an onset event, or a frame at clarity ≥ 0.72 if we missed the attack |
| **sustain** | any frame at the same pitch above clarity 0.34 keeps it alive |
| **release** | only after 130 ms of *continuous* failure to find it |

Two thresholds plus a hold time is the hysteresis. The sustain threshold sits
well below the one needed to start, so a note that has decayed to clarity 0.45
— far too weak to trigger a new note — still comfortably holds the one already
showing. And because release needs 130 ms of continuous failure, a single bad
frame cannot make the display flicker, which matters constantly under the
pedal. A rival pitch has to persist for 50 ms before it takes over, so one
confused frame mid-decay does not yank the mark to a neighbouring note.

`tests/tracker-test.mjs` pins all of this down, including the case that made it
necessary: a 50 ms dropout mid-note must not produce an end/start pair.

### How the enharmonic spelling is chosen

The microphone hears one black key. F♯4 and G♭4 are the same black key, and no
amount of signal processing can tell you which one the player meant — the
detector only ever produces a MIDI number. Something has to decide, so the rule
is *agree with the music in front of you* (`spellForDisplay` in
`js/music/pitch.js`):

1. **Same note as the target** — spell it exactly as the target is written. Play
   the G♭4 the exercise asked for and you see a G♭4, not an F♯4.
2. **Same pitch class, wrong octave** — keep the target's letter and accidental
   and change the octave, so octave slips stay legible.
3. **Otherwise** — follow the exercise's key signature: flats for flat keys,
   sharps for sharp keys and for C major.

This is a display choice, not a claim about what you played. Rule 1 in
particular exists so that the written note and the played note line up visually
when they match, rather than sitting a staff position apart with different
accidentals attached to the same key.

---

## Latency

This is treated as a first-class feature because it decides whether any timing
score means anything.

### What the platform tells you

The Latency tab shows `AudioContext.baseLatency` and
`AudioContext.outputLatency` as reported, plus the sample rate and the render
quantum. These cover the **output** side only.

**No browser reports microphone input latency.** The chain from your finger to
a detected onset — the piano's own sound, the air, the microphone, the OS input
buffer, the browser's input buffer, our analysis window — is invisible to the
API. On iOS, `outputLatency` is frequently reported as 0 or omitted entirely,
so the panel says "n/a" rather than showing a misleading zero. A Bluetooth
headset or speaker adds 100–200 ms on top of everything else.

### What calibration measures

Because the platform numbers cannot answer the question, the app measures it.

Twelve clicks are scheduled at exact `AudioContext` times. You play any single
note on each. For every click we record the detected onset time, pair it with
its nearest intended beat, and take

```
offsetSec = median(detectedOnsetTime − intendedBeatTime)
```

taken over the deviations that fall within a third of a beat (or 150 ms,
whichever is smaller) — anything further out is a wrong note, not a latency
measurement. Median rather than mean, and interquartile range rather than
standard deviation, so that one missed or doubled note cannot drag the answer
without anyone noticing.

The result is almost always positive: detection lags reality. The scorer
subtracts it from every detected onset before comparing against the beat grid.

The **spread** is stored alongside it and shown, because a wide spread means the
measurement should not be trusted — you played unevenly, or the room is noisy —
and the app says so rather than quietly applying a bad number. Under ±30 ms is
good; over ±60 ms, run it again.

A **manual adjustment** slider adds to the measured figure, and *Raw
diagnostics* shows the per-note deviations so an odd result is diagnosable
rather than mysterious.

Everything is stored in `localStorage` and survives reloads.

### Timestamps

Every onset and every analysis frame is stamped against the audio clock,
derived from the worklet's own sample counter anchored to `currentTime` on its
first render quantum. Nothing musical uses `Date.now()` or `performance.now()`.
The only timers anywhere in the app are display throttles and cosmetic
animation delays, and both are labelled as such in the source.

Similarly there is no `setInterval` scheduling of sound. The calibration click
track is scheduled in full, up front, at exact audio times. The open-ended
metronome uses a lookahead scheduler whose `requestAnimationFrame` wakeup only
decides *when to think about scheduling* — every click's actual time is still
computed on the audio clock and handed to the audio thread in advance.

---

## Structure

```
index.html                     no build step; plain ES modules, served static
css/app.css                    mobile-first, 375 px target
exercises/
  index.json                   the list of exercise files
  *.json                       the exercises themselves
js/
  main.js                      the shell: creates the session, switches views
  app/
    session.js                 THE one audio pipeline; views subscribe to it
  views/
    listen.js                  \
    practice.js                 > observers. DOM only. Never touch audio.
    latency.js                 /
  practice/
    played-note.js             "what is sounding right now", with hysteresis
  audio/
    engine.js                  AudioContext, getUserMedia, worklet, latency report
    worklet-loader.js          concatenates dsp.js + pitch-processor.js into one module
    dsp.js                     FFT, MPM, onset detector — plain script, no imports
    pitch-processor.js         the AudioWorkletProcessor — plain script, no imports
    input-source.js            the input abstraction + MicInputSource
    metronome.js               click track on the audio clock
    latency.js                 calibration routine and the stored offset
  music/
    pitch.js                   frequency ↔ MIDI ↔ note name ↔ staff position
  notation/
    glyphs.js                  hand-built clef, accidental and notehead geometry
    staff.js                   SVG staff renderer
tests/
  dsp-test.mjs                 headless DSP checks (node)
  tracker-test.mjs             played-note hysteresis and spelling (node)
  browser-test.html            drives the real app with synthetic audio
```

### Two things that look odd and are deliberate

**`dsp.js` and `pitch-processor.js` are plain scripts with no `import` or
`export`.** `AudioWorklet` module scripts are supposed to support static
imports, but support has been unreliable on iOS Safari. Rather than keep two
copies of the DSP — one for the worklet and one for the tests — the loader
fetches both files, concatenates them into a Blob and registers that. One
source of truth, works everywhere `AudioWorklet` itself works, and the Node
test suite runs the identical file.

**The notation is hand-rolled, not VexFlow.** Every glyph in `glyphs.js` is
built from explicit control points in units of one staff space, with the origin
at the pitch the glyph refers to. Scaling is a multiply, and any part of a
glyph can be animated independently — which is the entire reason for not using
a music font. The treble clef, for instance, is one continuous stroke traced
from the tail, up the stem, into the top curl, back down crossing the stem
twice, round the big loop, and spiralling in to finish exactly on the G line.

---

## Extending it

### Add an exercise

Write the JSON, add the filename to `exercises/index.json`, reload. That is the
whole procedure.

### Replace the input

Everything above the input layer talks only to an `InputSource`
(`js/audio/input-source.js`), which emits exactly two events: `frame`
(continuous state, for the readout) and `note` (a discrete key strike, stamped
on the audio clock). A Web MIDI source or a polyphonic audio source is a new
class implementing that contract; nothing downstream changes.

`capabilities` declares `{ kind, polyphonic, hasVelocity, hasNoteOff }` so that
downstream code can adapt rather than assume. A polyphonic source emits one
`note` per struck key.

`engine.startInput({ sourceNode })` accepts any `AudioNode` in place of the
microphone. That is how the browser test suite drives the real pipeline with
synthesised tones and no microphone permission; nothing downstream of that
point differs between the two cases.

The Clavinova that prompted all this cannot do USB MIDI to an iPhone, which is
why the microphone path exists. If that ever changes — a different cable, a
different device, a Bluetooth MIDI adapter — a `MidiInputSource` would be
maybe eighty lines, would make onset timing exact, and would make every caveat
in the pitch-detection section above disappear at once.

### What Phase 2 and beyond will need

Structurally anticipated, deliberately not built:

- **A series of notes.** `StaffRenderer.render()` already takes a list with
  per-note `x` and `state`, and `setNoteState(id, state)` updates one note
  without a re-render. Exercises already carry every note with its `beat` and
  `duration`.
- **Scrolling to a beat.** The metronome's lookahead scheduler already reports
  each beat's exact audio time ahead of the sound, which is what an animation
  should be driven from — not from a timer, and not from `currentTime` sampled
  during the frame.
- **Timed scoring.** `tolerance.timingMs` is already in the schema and
  `LatencyCalibration.correct(detectedTime)` already exists to convert a
  detected onset into the time the note was actually played.
- **Backing instrumentation.** It would hang off `engine.outputBus`, and its
  latency is already accounted for by the same calibration.

---

## Known limitations of Phase 1

- Monophonic only.
- Practice is untimed: play the highlighted note and it advances. Nothing is
  scored against a beat yet, which is why calibration has no visible effect in
  the Practice tab today. It is measured now so that it is correct later.
- The key signature is not drawn on the staff, only used for spelling.
- Only quarter-note noteheads are drawn — no beams, flags, rests or dots.
- One target note is shown at a time, plus the note you are playing.
- The played note is monophonic like everything else: play a chord and one
  note will show, with low confidence.
