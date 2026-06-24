import { useState, useRef } from "react";

const ACCENT = "#C8FF00";
const BG = "#0A0A0A";
const SURFACE = "#141414";
const SURFACE2 = "#1E1E1E";
const SURFACE3 = "#252525";
const MUTED = "#555";
const MUTED2 = "#777";
const TEXT = "#E8E8E8";

// ─── Audio Analysis ───────────────────────────────────────────────────────────

function parseAudio(file) {
  return new Promise((resolve, reject) => {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) { reject(new Error("Web Audio not supported")); return; }
    const ctx = new AudioContext();
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const buffer = await ctx.decodeAudioData(e.target.result);
        const duration = buffer.duration;
        const sampleRate = buffer.sampleRate;
        const channelData = buffer.getChannelData(0);

        // RMS energy
        let sum = 0;
        for (let i = 0; i < channelData.length; i++) sum += channelData[i] ** 2;
        const rms = Math.sqrt(sum / channelData.length);

        // BPM via autocorrelation on energy envelope
        const frameSize = Math.floor(sampleRate / 100);
        const energyEnv = [];
        for (let i = 0; i + frameSize < channelData.length; i += frameSize) {
          let e = 0;
          for (let j = 0; j < frameSize; j++) e += channelData[i + j] ** 2;
          energyEnv.push(Math.sqrt(e / frameSize));
        }
        const bpm = estimateBPM(energyEnv, sampleRate / frameSize);

        // Dynamic range
        let peak = 0;
        for (let i = 0; i < channelData.length; i++) {
          if (Math.abs(channelData[i]) > peak) peak = Math.abs(channelData[i]);
        }
        const dynamicRange = peak / (rms + 0.0001);

        // Spectral brightness (first 5s)
        const analyseLen = Math.min(sampleRate * 5, channelData.length);
        const brightness = spectralBrightness(channelData, analyseLen);

        // Section energy map (8 segments)
        const segmentCount = 8;
        const segLen = Math.floor(channelData.length / segmentCount);
        const energyMap = [];
        for (let s = 0; s < segmentCount; s++) {
          let e = 0;
          for (let i = s * segLen; i < (s + 1) * segLen; i++) e += channelData[i] ** 2;
          energyMap.push(Math.sqrt(e / segLen));
        }
        const maxE = Math.max(...energyMap);
        const normalizedEnergyMap = energyMap.map(v => +(v / maxE).toFixed(2));

        ctx.close();
        resolve({ duration, sampleRate, rms, bpm, dynamicRange, brightness, normalizedEnergyMap });
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function estimateBPM(energyEnv, fps) {
  const minLag = Math.floor(fps * 0.3);
  const maxLag = Math.floor(fps * 1.5);
  let bestLag = minLag, bestCorr = -Infinity;
  for (let lag = minLag; lag < maxLag && lag < energyEnv.length; lag++) {
    let corr = 0;
    for (let i = 0; i + lag < energyEnv.length; i++) corr += energyEnv[i] * energyEnv[i + lag];
    if (corr > bestCorr) { bestCorr = corr; bestLag = lag; }
  }
  return Math.round(60 / (bestLag / fps));
}

function spectralBrightness(channelData, len) {
  let lowE = 0, highE = 0;
  const halfLen = Math.floor(len / 2);
  for (let i = 0; i < halfLen; i++) lowE += channelData[i] ** 2;
  for (let i = halfLen; i < len; i++) highE += channelData[i] ** 2;
  return highE / (lowE + highE + 0.0001);
}

function moodFromAnalysis({ bpm, rms, dynamicRange, brightness }) {
  const energy = rms > 0.15 ? "high" : rms > 0.05 ? "mid" : "low";
  const tempo = bpm > 130 ? "fast" : bpm > 90 ? "mid" : "slow";
  const bright = brightness > 0.45 ? "bright" : brightness > 0.3 ? "balanced" : "dark";
  const dynamic = dynamicRange > 8 ? "punchy" : dynamicRange > 4 ? "moderate" : "compressed";
  return { energy, tempo, bright, dynamic };
}

// ─── Waveform Canvas ──────────────────────────────────────────────────────────

function WaveformViz({ file }) {
  const canvasRef = useRef(null);
  const drawnRef = useRef(false);

  if (file && !drawnRef.current) {
    drawnRef.current = true;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const ctx2 = new (window.AudioContext || window.webkitAudioContext)();
      const buffer = await ctx2.decodeAudioData(e.target.result);
      ctx2.close();
      const data = buffer.getChannelData(0);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      const step = Math.ceil(data.length / W);
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x < W; x++) {
        let min = 1, max = -1;
        for (let j = 0; j < step; j++) {
          const v = data[x * step + j] || 0;
          if (v < min) min = v;
          if (v > max) max = v;
        }
        ctx.moveTo(x, (1 + min) * H / 2);
        ctx.lineTo(x, (1 + max) * H / 2);
      }
      ctx.stroke();
    };
    reader.readAsArrayBuffer(file);
  }

  return (
    <canvas ref={canvasRef} width={700} height={56}
      style={{ width: "100%", height: 56, borderRadius: 4, background: SURFACE2, display: "block" }} />
  );
}

// ─── Energy Map Bar ───────────────────────────────────────────────────────────

function EnergyMap({ map }) {
  if (!map) return null;
  return (
    <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 32 }}>
      {map.map((v, i) => (
        <div key={i} style={{
          flex: 1,
          height: `${Math.max(10, v * 100)}%`,
          background: `rgba(200,255,0,${0.3 + v * 0.7})`,
          borderRadius: 2,
          transition: "height 0.3s",
        }} title={`Segment ${i + 1}: ${Math.round(v * 100)}%`} />
      ))}
    </div>
  );
}

// ─── UI Primitives ────────────────────────────────────────────────────────────

function StatBadge({ label, value }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
      <span style={{ color: ACCENT, fontFamily: "monospace", fontSize: 17, fontWeight: 700, letterSpacing: 0.5 }}>{value}</span>
      <span style={{ color: MUTED, fontSize: 9, textTransform: "uppercase", letterSpacing: 2 }}>{label}</span>
    </div>
  );
}

function Label({ children }) {
  return (
    <div style={{ color: MUTED2, fontSize: 10, fontFamily: "monospace", letterSpacing: 2.5, textTransform: "uppercase", marginBottom: 7 }}>
      {children}
    </div>
  );
}

// ─── Scene Card ───────────────────────────────────────────────────────────────

function SceneCard({ scene, index }) {
  const [expanded, setExpanded] = useState(false);
  const bg = scene.palette?.[0] || "#111";
  const accent2 = scene.palette?.[1] || ACCENT;
  return (
    <div style={{
      background: SURFACE,
      borderRadius: 10,
      border: `1px solid ${SURFACE3}`,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      cursor: "pointer",
      transition: "border-color 0.15s",
    }}
      onClick={() => setExpanded(e => !e)}
    >
      {/* Color frame */}
      <div style={{
        background: bg,
        height: 110,
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}>
        {scene.palette?.map((c, i) => (
          <div key={i} style={{
            position: "absolute",
            bottom: 0,
            left: `${(i / scene.palette.length) * 100}%`,
            width: `${100 / scene.palette.length}%`,
            height: "28%",
            background: c,
            opacity: 0.75,
          }} />
        ))}
        {/* Gradient vignette */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(to bottom, rgba(0,0,0,0.1), rgba(0,0,0,0.5))",
        }} />
        <div style={{
          zIndex: 1, background: "rgba(0,0,0,0.55)", borderRadius: 4,
          padding: "3px 9px", fontFamily: "monospace", color: ACCENT,
          fontSize: 10, letterSpacing: 2,
        }}>
          SHOT {String(index + 1).padStart(2, "0")}
        </div>
        <div style={{
          position: "absolute", top: 8, right: 8,
          background: "rgba(0,0,0,0.6)", borderRadius: 3,
          padding: "2px 6px", color: TEXT, fontSize: 9, fontFamily: "monospace",
        }}>
          {scene.startTime}s – {scene.endTime}s
        </div>
        {scene.lyricLine && (
          <div style={{
            position: "absolute", bottom: 14, left: 0, right: 0,
            textAlign: "center", zIndex: 2,
            color: "rgba(255,255,255,0.85)", fontSize: 10,
            fontStyle: "italic", padding: "0 12px",
            textShadow: "0 1px 4px rgba(0,0,0,0.9)",
          }}>
            "{scene.lyricLine}"
          </div>
        )}
      </div>

      <div style={{ padding: "11px 13px", display: "flex", flexDirection: "column", gap: 7, flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <span style={{ color: TEXT, fontWeight: 600, fontSize: 13, lineHeight: 1.3 }}>{scene.title}</span>
          <span style={{
            background: SURFACE2, color: ACCENT, fontSize: 8,
            padding: "2px 6px", borderRadius: 20, letterSpacing: 1,
            fontFamily: "monospace", textTransform: "uppercase",
            whiteSpace: "nowrap", marginLeft: 8, flexShrink: 0,
          }}>{scene.shotType}</span>
        </div>

        <p style={{ color: "#999", fontSize: 12, lineHeight: 1.6, margin: 0 }}>{scene.description}</p>

        {expanded && (
          <div style={{ borderTop: `1px solid ${SURFACE3}`, paddingTop: 9, display: "flex", flexDirection: "column", gap: 6 }}>
            {scene.symbolism && (
              <div>
                <span style={{ color: MUTED, fontSize: 10, letterSpacing: 1 }}>SYMBOLISM · </span>
                <span style={{ color: "#aaa", fontSize: 11 }}>{scene.symbolism}</span>
              </div>
            )}
            {scene.emotion && (
              <div>
                <span style={{ color: MUTED, fontSize: 10, letterSpacing: 1 }}>EMOTION · </span>
                <span style={{ color: "#aaa", fontSize: 11 }}>{scene.emotion}</span>
              </div>
            )}
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 2 }}>
              {scene.palette?.map((c, i) => (
                <div key={i} title={c} style={{
                  width: 20, height: 20, borderRadius: 4,
                  background: c, border: "1px solid rgba(255,255,255,0.1)",
                }} />
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {scene.tags?.map((t, i) => (
            <span key={i} style={{
              background: SURFACE2, color: MUTED, fontSize: 10,
              padding: "2px 6px", borderRadius: 20,
            }}>#{t}</span>
          ))}
        </div>

        <div style={{ color: "#555", fontSize: 11, fontFamily: "monospace", display: "flex", gap: 10, flexWrap: "wrap" }}>
          <span>📷 {scene.cameraMove}</span>
          <span>✂️ {scene.editPace}</span>
        </div>

        <div style={{ color: MUTED, fontSize: 10, textAlign: "right" }}>
          {expanded ? "▲ less" : "▼ details"}
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [file, setFile] = useState(null);
  const [audioData, setAudioData] = useState(null);
  const [lyrics, setLyrics] = useState("");
  const [trackTitle, setTrackTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [vibeNotes, setVibeNotes] = useState("");
  const [storyboard, setStoryboard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);

  const loadingMsgs = [
    "Reading the room...",
    "Blocking out shots...",
    "Finding the color palette...",
    "Writing the treatment...",
  ];

  async function handleFile(f) {
    if (!f) return;
    if (!f.name.match(/\.(wav|mp3|aac|ogg|flac|m4a)$/i)) {
      setError("Please drop an audio file (.wav, .mp3, .flac, etc.)");
      return;
    }
    setError(null);
    setFile(f);
    setStoryboard(null);
    setAudioData(null);
    if (!f.name.match(/\.(wav)$/i)) {
      // Non-wav: skip waveform decode, just store file info
      setAudioData({ duration: 0, bpm: "?", rms: 0, dynamicRange: 0, brightness: 0, normalizedEnergyMap: null, noWaveform: true });
      return;
    }
    try {
      const data = await parseAudio(f);
      setAudioData(data);
    } catch (e) {
      setError("Could not decode audio. Make sure it's a valid file.");
    }
  }

  async function generate() {
    setLoading(true);
    setError(null);
    setStoryboard(null);

    let msgIdx = 0;
    setLoadingMsg(loadingMsgs[0]);
    const msgTimer = setInterval(() => {
      msgIdx = (msgIdx + 1) % loadingMsgs.length;
      setLoadingMsg(loadingMsgs[msgIdx]);
    }, 2200);

    const mood = audioData && !audioData.noWaveform ? moodFromAnalysis(audioData) : null;
    const durationMin = audioData ? Math.floor(audioData.duration / 60) : 0;
    const durationSec = audioData ? Math.round(audioData.duration % 60) : 0;
    const hasAudio = audioData && !audioData.noWaveform;
    const hasLyrics = lyrics.trim().length > 0;
    const totalSeconds = audioData ? Math.round(audioData.duration) : 180;

    const audioSection = hasAudio ? `
AUDIO ANALYSIS (from waveform):
- Duration: ${durationMin}m ${durationSec}s (${totalSeconds}s total)
- Estimated BPM: ${audioData.bpm}
- Energy level: ${mood.energy} (RMS: ${audioData.rms.toFixed(4)})
- Tempo feel: ${mood.tempo}
- Spectral brightness: ${mood.bright}
- Dynamic character: ${mood.dynamic} (dynamic range ratio: ${audioData.dynamicRange.toFixed(1)})
- Energy across 8 track segments (0=silence, 1=peak): ${audioData.normalizedEnergyMap?.join(", ")}
  (Use this energy map to time scene intensity — louder segments = more kinetic visuals)` : `
AUDIO: File provided but not analyzable as WAV. Duration unknown — assume a typical 3–4 minute track.
Spread scene timestamps across ~200 seconds total.`;

    const lyricsSection = hasLyrics ? `
LYRICS:
---
${lyrics.trim()}
---
Analyze these lyrics for:
- Central themes and narrative arc
- Emotional trajectory (does it build, release, repeat?)
- Key imagery and metaphors in the text
- Tone (e.g. introspective, defiant, euphoric, melancholic)
- Any specific lines that deserve a visual moment — include that line as "lyricLine" in the scene
Use the lyric structure to guide scene order and content. Scenes should visually interpret the lyrics, not just play behind them.` : "";

    const vibeSection = vibeNotes.trim() ? `
ARTIST / VIBE NOTES FROM CREATOR:
"${vibeNotes.trim()}"
Take these notes seriously — they override aesthetic defaults.` : "";

    const metaSection = (trackTitle || artist) ? `
TRACK INFO:
${trackTitle ? `- Title: "${trackTitle}"` : ""}
${artist ? `- Artist: ${artist}` : ""}` : "";

    const prompt = `You are a music video director. Your job is to create a detailed, cinematic storyboard for a music video.

${metaSection}
${audioSection}
${lyricsSection}
${vibeSection}

INSTRUCTIONS:
- Create 6–9 scenes that span the full track duration
- Distribute scene timestamps proportionally across the runtime
- Use the energy map (if provided) to vary pacing — high-energy segments get fast cuts, low-energy get slow/contemplative shots
- If lyrics are provided, tie each scene to a specific part of the song structure (intro, verse, chorus, bridge, outro)
- Make the visual concept feel like a real director's pitch — specific, cinematic, with a point of view
- Avoid generic music video tropes unless they're subverted intentionally

Respond with ONLY valid JSON, no markdown fences, no explanation, nothing else.

{
  "concept": "Director's treatment — 2-3 sentences. Specific and evocative, like a real pitch.",
  "narrative": "One sentence describing the emotional arc of the video from start to finish.",
  "genre": "Visual genre (e.g. 'sun-bleached desert road movie', 'neon-drenched Tokyo noir', 'grainy lo-fi dreamscape')",
  "colorMood": "Palette description (e.g. 'desaturated blues and burnt orange with flashes of white')",
  "themes": ["theme1", "theme2", "theme3"],
  "influences": ["Director or film reference", "Another reference"],
  "scenes": [
    {
      "title": "Scene title",
      "section": "Intro / Verse 1 / Chorus / Bridge / etc.",
      "startTime": 0,
      "endTime": 28,
      "description": "What we see. Be specific about subject, setting, light, action. 2-3 sentences.",
      "lyricLine": "Optional: the lyric line playing during this scene, verbatim from the lyrics provided (omit if no lyrics given)",
      "shotType": "Wide Establishing / Close-Up / Medium / Over-the-shoulder / POV / etc.",
      "cameraMove": "Static / Slow push / Handheld drift / Drone descend / Whip pan / etc.",
      "editPace": "Single long take / Quick cuts every 2s / Crossfade / Montage / etc.",
      "symbolism": "What this shot represents emotionally or thematically (1 sentence)",
      "emotion": "The feeling this scene should evoke in the viewer",
      "palette": ["#hex1", "#hex2", "#hex3"],
      "tags": ["tag1", "tag2", "tag3"]
    }
  ]
}`;

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const raw = data.text || "";
      // Strip markdown fences
      const clean = raw.replace(/```json|```/g, "").trim();
      // Find the outermost JSON object even if response is truncated
      const start = clean.indexOf("{");
      const end = clean.lastIndexOf("}");
      if (start === -1 || end === -1) throw new Error("No JSON object found in response");
      const jsonStr = clean.slice(start, end + 1);
      let parsed;
      try {
        parsed = JSON.parse(jsonStr);
      } catch (parseErr) {
        // Last resort: try to extract what we have with a relaxed parse
        console.error("Parse error, raw response:", raw);
        throw new Error("Could not parse response JSON: " + parseErr.message);
      }
      if (!parsed.scenes || parsed.scenes.length === 0) throw new Error("No scenes in response");
      setStoryboard(parsed);
    } catch (e) {
      setError("Failed to generate storyboard: " + e.message);
      console.error(e);
    }
    clearInterval(msgTimer);
    setLoading(false);
  }

  const canGenerate = (file || lyrics.trim().length > 0) && !loading;

  return (
    <div style={{
      minHeight: "100vh", background: BG, color: TEXT,
      fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
      padding: "32px 22px", maxWidth: 880, margin: "0 auto",
    }}>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 5 }}>
          <span style={{ color: ACCENT, fontFamily: "monospace", fontSize: 10, letterSpacing: 3, textTransform: "uppercase" }}>▶ WAVE</span>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: -1 }}>Storyboard</h1>
        </div>
        <p style={{ color: MUTED, margin: 0, fontSize: 13 }}>
          Drop a track, paste lyrics, describe the vibe — get a director's storyboard.
        </p>
      </div>

      {/* ── Row 1: Drop Zone ── */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
        onClick={() => fileRef.current?.click()}
        style={{
          border: `1.5px dashed ${dragging ? ACCENT : file ? "#2e2e2e" : "#222"}`,
          borderRadius: 10, padding: file ? "16px 18px" : "26px 18px",
          textAlign: "center", cursor: "pointer",
          transition: "all 0.2s",
          background: dragging ? "rgba(200,255,0,0.025)" : "transparent",
          marginBottom: 16,
        }}
      >
        <input ref={fileRef} type="file" accept=".wav,.mp3,.flac,.aac,.ogg,.m4a"
          style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
        {file ? (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ color: ACCENT, fontFamily: "monospace", fontSize: 12 }}>✓ {file.name}</span>
              <span style={{ color: MUTED, fontSize: 11, cursor: "pointer" }}
                onClick={ev => { ev.stopPropagation(); setFile(null); setAudioData(null); }}>
                ✕ remove
              </span>
            </div>
            {file.name.endsWith(".wav") && <WaveformViz file={file} />}
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🎵</div>
            <div style={{ color: TEXT, fontSize: 13, marginBottom: 3 }}>Drop your track here</div>
            <div style={{ color: MUTED, fontSize: 11 }}>.wav .mp3 .flac .aac · or click to browse</div>
          </div>
        )}
      </div>

      {/* Audio stats */}
      {audioData && !audioData.noWaveform && (
        <div style={{
          background: SURFACE, borderRadius: 8, padding: "14px 18px",
          display: "flex", gap: 20, justifyContent: "space-between",
          alignItems: "center", marginBottom: 16, flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <StatBadge label="Duration" value={`${Math.floor(audioData.duration / 60)}:${String(Math.round(audioData.duration % 60)).padStart(2, "0")}`} />
            <StatBadge label="Est. BPM" value={audioData.bpm} />
            <StatBadge label="Energy" value={moodFromAnalysis(audioData).energy.toUpperCase()} />
            <StatBadge label="Texture" value={moodFromAnalysis(audioData).bright.toUpperCase()} />
            <StatBadge label="Dynamics" value={moodFromAnalysis(audioData).dynamic.toUpperCase()} />
          </div>
          {audioData.normalizedEnergyMap && (
            <div style={{ minWidth: 120, flex: 1, maxWidth: 160 }}>
              <div style={{ color: MUTED, fontSize: 9, fontFamily: "monospace", letterSpacing: 2, marginBottom: 4 }}>ENERGY MAP</div>
              <EnergyMap map={audioData.normalizedEnergyMap} />
            </div>
          )}
        </div>
      )}

      {/* ── Row 2: Meta ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <Label>Track Title (optional)</Label>
          <input value={trackTitle} onChange={e => setTrackTitle(e.target.value)}
            placeholder='e.g. "Golden Hour"'
            style={{
              width: "100%", background: SURFACE, border: `1px solid ${SURFACE3}`,
              borderRadius: 7, padding: "10px 12px", color: TEXT, fontSize: 13,
              outline: "none", boxSizing: "border-box",
            }} />
        </div>
        <div>
          <Label>Artist (optional)</Label>
          <input value={artist} onChange={e => setArtist(e.target.value)}
            placeholder='e.g. "KAYTRANADA"'
            style={{
              width: "100%", background: SURFACE, border: `1px solid ${SURFACE3}`,
              borderRadius: 7, padding: "10px 12px", color: TEXT, fontSize: 13,
              outline: "none", boxSizing: "border-box",
            }} />
        </div>
      </div>

      {/* ── Row 3: Lyrics ── */}
      <div style={{ marginBottom: 12 }}>
        <Label>Lyrics (optional but recommended)</Label>
        <textarea
          value={lyrics}
          onChange={e => setLyrics(e.target.value)}
          placeholder={"Paste your full lyrics here...\n\nThe AI will read the narrative arc, themes, imagery, and structure to tie scenes to specific parts of the song."}
          rows={8}
          style={{
            width: "100%", background: SURFACE, border: `1px solid ${SURFACE3}`,
            borderRadius: 7, padding: "12px 14px", color: TEXT, fontSize: 12,
            lineHeight: 1.7, outline: "none", resize: "vertical", fontFamily: "inherit",
            boxSizing: "border-box",
          }} />
      </div>

      {/* ── Row 4: Vibe Notes ── */}
      <div style={{ marginBottom: 20 }}>
        <Label>Vibe / Direction Notes (optional)</Label>
        <textarea
          value={vibeNotes}
          onChange={e => setVibeNotes(e.target.value)}
          placeholder={"Describe the feel you want. Anything goes:\n\n\"Shot on 16mm, kind of like a Wong Kar-wai film. Rainy city streets, late at night, neon reflections.\"\n\"Warm and nostalgic — summer 2009, suburban backyard, handheld iPhone footage aesthetic.\"\n\"Abstract, no narrative, just color and texture reacting to the beat.\""}
          rows={4}
          style={{
            width: "100%", background: SURFACE, border: `1px solid ${SURFACE3}`,
            borderRadius: 7, padding: "12px 14px", color: TEXT, fontSize: 12,
            lineHeight: 1.7, outline: "none", resize: "vertical", fontFamily: "inherit",
            boxSizing: "border-box",
          }} />
      </div>

      {error && (
        <div style={{
          background: "#180000", border: "1px solid #3a0000", borderRadius: 7,
          padding: "10px 14px", color: "#ff7070", fontSize: 13, marginBottom: 16,
        }}>{error}</div>
      )}

      {/* Generate button */}
      {!loading && (
        <button onClick={generate} disabled={!canGenerate}
          style={{
            width: "100%", background: canGenerate ? ACCENT : "#1e1e1e",
            color: canGenerate ? "#000" : MUTED, border: "none", borderRadius: 8,
            padding: "14px", fontSize: 13, fontWeight: 700, letterSpacing: 1.5,
            cursor: canGenerate ? "pointer" : "not-allowed",
            textTransform: "uppercase", marginBottom: 36, transition: "all 0.2s",
          }}>
          Generate Storyboard
        </button>
      )}

      {loading && (
        <div style={{ textAlign: "center", padding: "28px 0", marginBottom: 36 }}>
          <div style={{
            display: "inline-flex", gap: 6, alignItems: "center",
            background: SURFACE, borderRadius: 24, padding: "10px 20px",
          }}>
            <span style={{ color: ACCENT, fontSize: 13, animation: "spin 1s linear infinite" }}>◆</span>
            <span style={{ color: TEXT, fontSize: 13 }}>{loadingMsg}</span>
          </div>
          <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
        </div>
      )}

      {/* ── Storyboard Output ── */}
      {storyboard && (
        <div>
          {/* Treatment card */}
          <div style={{
            background: SURFACE, borderRadius: 10, padding: "20px 22px",
            marginBottom: 24, borderLeft: `3px solid ${ACCENT}`,
          }}>
            <Label>Director's Treatment</Label>
            <p style={{ color: TEXT, fontSize: 14, lineHeight: 1.75, margin: "0 0 12px" }}>{storyboard.concept}</p>
            {storyboard.narrative && (
              <p style={{ color: MUTED2, fontSize: 13, fontStyle: "italic", margin: "0 0 14px", lineHeight: 1.6 }}>
                "{storyboard.narrative}"
              </p>
            )}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginBottom: 14 }}>
              <div>
                <span style={{ color: MUTED, fontSize: 10, letterSpacing: 1 }}>GENRE  </span>
                <span style={{ color: TEXT, fontSize: 12, fontWeight: 600 }}>{storyboard.genre}</span>
              </div>
              <div>
                <span style={{ color: MUTED, fontSize: 10, letterSpacing: 1 }}>COLOR  </span>
                <span style={{ color: TEXT, fontSize: 12, fontWeight: 600 }}>{storyboard.colorMood}</span>
              </div>
            </div>

            {storyboard.themes?.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {storyboard.themes.map((t, i) => (
                  <span key={i} style={{
                    background: "rgba(200,255,0,0.08)", color: ACCENT,
                    fontSize: 10, padding: "3px 9px", borderRadius: 20,
                    border: "1px solid rgba(200,255,0,0.2)", letterSpacing: 0.5,
                  }}>{t}</span>
                ))}
              </div>
            )}

            {storyboard.influences?.length > 0 && (
              <div style={{ color: MUTED, fontSize: 11 }}>
                <span style={{ letterSpacing: 1 }}>REFERENCES  </span>
                {storyboard.influences.join("  ·  ")}
              </div>
            )}
          </div>

          {/* Scene count */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <span style={{ color: MUTED, fontSize: 10, fontFamily: "monospace", letterSpacing: 3, textTransform: "uppercase" }}>
              {storyboard.scenes?.length} Scenes
            </span>
            <span style={{ color: MUTED, fontSize: 11 }}>Click a card for details</span>
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(255px, 1fr))",
            gap: 14,
          }}>
            {storyboard.scenes?.map((scene, i) => (
              <SceneCard key={i} scene={scene} index={i} />
            ))}
          </div>

          {/* Re-generate */}
          <div style={{ marginTop: 28, textAlign: "center" }}>
            <button onClick={generate}
              style={{
                background: "transparent", border: `1px solid ${SURFACE3}`,
                color: MUTED2, borderRadius: 7, padding: "10px 24px",
                fontSize: 12, cursor: "pointer", letterSpacing: 1,
              }}>
              ↺ Regenerate
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
