// Tiny zero-asset WebAudio synth for the game's blips. Everything is generated
// on the fly (oscillator + gain envelope) so there are no files to load and it
// works offline. Tune the feel from the FX table below.
//
// Autoplay policy: browsers won't let audio start until a user gesture, so
// `unlock()` is called on the first pointerdown to create/resume the context.

let ac: AudioContext | null = null
let master: GainNode | null = null
let muted = false

function ctx(): AudioContext | null {
  if (!ac) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ac = new AC()
    master = ac.createGain()
    master.gain.value = 0.5
    master.connect(ac.destination)
  }
  return ac
}

/** Call from the first user gesture to satisfy the autoplay policy. */
export function unlock() {
  const c = ctx()
  if (c && c.state === 'suspended') c.resume()
}

export function setMuted(m: boolean) {
  muted = m
}
export function isMuted() {
  return muted
}

interface Tone {
  freq: number
  dur: number
  type?: OscillatorType
  gain?: number
  /** target frequency to glide to over the note (0 = none) */
  to?: number
}

function tone({ freq, dur, type = 'square', gain = 0.25, to = 0 }: Tone, delay = 0) {
  const c = ctx()
  if (!c || muted || !master) return
  const t = c.currentTime + delay
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (to > 0) o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.01, dur * 0.3))
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(master)
  o.start(t)
  o.stop(t + dur + 0.02)
}

function chord(tones: Tone[], spacing = 0.08) {
  tones.forEach((tn, i) => tone(tn, i * spacing))
}

export const sfx = {
  unlock,
  setMuted,
  isMuted,

  /** Ball off a paddle — pitch rises a little with impact speed. */
  paddle(speed = 16) {
    const f = 200 + Math.min(260, speed * 6)
    tone({ freq: f, dur: 0.06, type: 'square', gain: 0.28 })
  },
  /** Ball off a wall — a low, dry thud. */
  wall() {
    tone({ freq: 150, dur: 0.05, type: 'triangle', gain: 0.22, to: 90 })
  },
  /** Ball strikes a tug-of-war star. */
  star() {
    tone({ freq: 900, dur: 0.09, type: 'sine', gain: 0.25, to: 1400 })
  },
  /** Ball enters the ramp. */
  rampIn() {
    tone({ freq: 300, dur: 0.22, type: 'sawtooth', gain: 0.2, to: 900 })
  },
  /** Ball released off the ramp, boosted. */
  rampOut() {
    tone({ freq: 500, dur: 0.18, type: 'sawtooth', gain: 0.24, to: 1600 })
  },
  /** Laser bolt fired. */
  gun() {
    tone({ freq: 1200, dur: 0.18, type: 'sawtooth', gain: 0.22, to: 260 })
  },
  /** Bolt connects and freezes the AI. */
  zap() {
    tone({ freq: 220, dur: 0.16, type: 'square', gain: 0.24, to: 60 })
  },
  /** Murderball shatters a paddle — a noisy crunch (stacked detuned tones). */
  smash() {
    tone({ freq: 180, dur: 0.22, type: 'sawtooth', gain: 0.26, to: 50 })
    tone({ freq: 90, dur: 0.26, type: 'square', gain: 0.22, to: 40 })
  },
  /** We score — bright rising arpeggio. */
  goalUs() {
    chord([
      { freq: 523, dur: 0.12, type: 'square' },
      { freq: 659, dur: 0.12, type: 'square' },
      { freq: 784, dur: 0.18, type: 'square' },
    ])
  },
  /** They score — dull falling two-note. */
  goalThem() {
    chord([
      { freq: 300, dur: 0.14, type: 'sawtooth', gain: 0.2 },
      { freq: 200, dur: 0.2, type: 'sawtooth', gain: 0.2 },
    ])
  },
  /** Match won. */
  win() {
    chord(
      [
        { freq: 523, dur: 0.16 },
        { freq: 659, dur: 0.16 },
        { freq: 784, dur: 0.16 },
        { freq: 1047, dur: 0.32 },
      ],
      0.14,
    )
  },
  /** Match lost. */
  lose() {
    chord(
      [
        { freq: 440, dur: 0.2, type: 'sawtooth', gain: 0.22 },
        { freq: 349, dur: 0.2, type: 'sawtooth', gain: 0.22 },
        { freq: 262, dur: 0.4, type: 'sawtooth', gain: 0.22 },
      ],
      0.18,
    )
  },
  /** Match drawn. */
  draw() {
    chord([
      { freq: 440, dur: 0.16 },
      { freq: 440, dur: 0.24 },
    ])
  },
}
