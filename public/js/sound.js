const Sound = (() => {
  let ctx = null;

  function ensure() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    App.soundEnabled = true;
    localStorage.setItem("voidSound", "on");
    document.getElementById("audioUnlock")?.classList.add("hidden");
  }

  function tone(freq, duration, type = "sine", gain = 0.06, delay = 0) {
    if (!App.soundEnabled) return;
    ensure();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = gain;
    osc.connect(g);
    g.connect(ctx.destination);
    const t = ctx.currentTime + delay;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  function play(cue) {
    if (!App.soundEnabled) {
      document.getElementById("audioUnlock")?.classList.remove("hidden");
      return;
    }

    if (cue === "night-start") {
      tone(130, .35, "sawtooth", .05);
      tone(82, .5, "sine", .04, .08);
    } else if (cue === "day-start") {
      tone(523, .18, "triangle", .05);
      tone(659, .18, "triangle", .05, .12);
      tone(784, .22, "triangle", .05, .24);
    } else if (cue === "vote") {
      tone(400, .12, "square", .04);
      tone(300, .12, "square", .04, .15);
    } else if (cue === "speaker-turn") {
      tone(880, .08, "triangle", .035);
      tone(1100, .08, "triangle", .035, .08);
    } else if (cue === "last-words") {
      tone(220, .4, "sine", .04);
    } else if (cue === "win") {
      tone(523, .16, "triangle", .055);
      tone(659, .16, "triangle", .055, .15);
      tone(784, .28, "triangle", .055, .3);
    } else if (cue === "result") {
      tone(180, .18, "sawtooth", .04);
    } else {
      tone(600, .1, "sine", .04);
    }
  }

  return { ensure, play };
})();

document.addEventListener("click", () => {
  if (!App.soundEnabled) return;
  try { Sound.ensure(); } catch {}
}, { once: true });
