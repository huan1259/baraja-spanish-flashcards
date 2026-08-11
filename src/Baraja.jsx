import React, { useState, useEffect, useRef, useCallback } from "react";
import VOCAB from "./decks.json";

const DECKS = Object.fromEntries(
  Object.entries(VOCAB).map(([k, arr]) => [k, arr.map((c, i) => ({ ...c, id: k + "-" + i }))])
);
const CARD_BY_ID = {};
Object.values(DECKS).forEach((a) => a.forEach((c) => { CARD_BY_ID[c.id] = c; }));
const LS = (typeof window !== "undefined" && window.localStorage) ? window.localStorage : null;
const STORE = LS ? {
  get: async (k) => { const v = LS.getItem(k); return v == null ? null : { value: v }; },
  set: async (k, v) => { LS.setItem(k, v); return { value: v }; },
  delete: async (k) => { LS.removeItem(k); return { deleted: true }; },
} : null;
const SKEY = "baraja_sessions_v1", PKEY = "baraja_prefs_v1";
const reviveSessions = (saved) => {
  const out = {};
  for (const key of Object.keys(saved || {})) {
    const s = saved[key] || {};
    const pick = (ids) => (ids || []).map((id) => CARD_BY_ID[id]).filter(Boolean);
    out[key] = { learning: pick(s.learning), learned: pick(s.learned), memorized: pick(s.memorized) };
  }
  return out;
};

const LEVELS = [
  { key: "A1", name: "Beginner",           suit: "oros"    },
  { key: "A2", name: "Elementary",         suit: "copas"   },
  { key: "B1", name: "Intermediate",       suit: "espadas" },
  { key: "B2", name: "Upper-intermediate", suit: "bastos"  },
];
const SUIT_COLOR = { oros: "var(--oro)", copas: "var(--copa)", espadas: "var(--espada)", bastos: "var(--basto)" };

/* ---- suit glyphs from the baraja española ---- */
function Suit({ suit, size = 22, color = "currentColor" }) {
  const s = { width: size, height: size, display: "block" };
  if (suit === "oros")
    return (<svg viewBox="0 0 24 24" style={s}><circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeWidth="1.6"/><circle cx="12" cy="12" r="4.4" fill="none" stroke={color} strokeWidth="1.6"/></svg>);
  if (suit === "copas")
    return (<svg viewBox="0 0 24 24" style={s}><path d="M6 4h12c0 5-2.6 8-6 8s-6-3-6-8Z" fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round"/><path d="M12 12v5m-3.5 3h7" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round"/></svg>);
  if (suit === "espadas")
    return (<svg viewBox="0 0 24 24" style={s}><path d="M12 3l3 11-3 3-3-3 3-11Z" fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round"/><path d="M8 18h8M12 17v4" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round"/></svg>);
  return (<svg viewBox="0 0 24 24" style={s}><path d="M12 3c1.4 3 4 5 4 5M12 3c-1.4 3-4 5-4 5M12 3v18" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round"/><path d="M8.5 21h7" stroke={color} strokeWidth="1.6" strokeLinecap="round"/></svg>);
}

const posLabel = (p) => ({ noun: "n.", verb: "v.", adjective: "adj.", adverb: "adv." }[p] || p);

export default function Baraja() {
  const [screen, setScreen] = useState("home");        // home | deck
  const [levelKey, setLevelKey] = useState("A1");
  const [sessions, setSessions] = useState({});         // key -> {learning, learned, memorized}
  const [reviewing, setReviewing] = useState("learning");
  const [direction, setDirection] = useState("es-en");  // es-en | en-es
  const [flipped, setFlipped] = useState(false);
  const [drag, setDrag] = useState({ dx: 0, active: false });
  const [leaving, setLeaving] = useState(null);         // 'left' | 'right' | null
  const [loaded, setLoaded] = useState(false);
  const [resetArmed, setResetArmed] = useState(false);
  const startRef = useRef({ x: 0, y: 0, moved: false });

  const reduceMotion = typeof window !== "undefined" &&
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const T = reduceMotion ? 0 : 240;

  const suit = LEVELS.find((l) => l.key === levelKey).suit;
  const sess = sessions[levelKey];
  const pile = sess ? sess[reviewing] : [];
  const card = pile[0];

  const startLevel = (key) => {
    setSessions((prev) => prev[key] ? prev : { ...prev, [key]: { learning: [...DECKS[key]], learned: [], memorized: [] } });
    setLevelKey(key); setReviewing("learning"); setFlipped(false); setDrag({ dx: 0, active: false }); setScreen("deck");
  };
  const restart = () => {
    setSessions((prev) => ({ ...prev, [levelKey]: { learning: [...DECKS[levelKey]], learned: [], memorized: [] } }));
    setReviewing("learning"); setFlipped(false); setDrag({ dx: 0, active: false });
  };
  const resetAll = async () => {
    setSessions({}); setResetArmed(false); setScreen("home");
    if (STORE) { try { await STORE.delete(SKEY); } catch (e) {} }
  };

  const applyResult = useCallback((dir) => {
    setSessions((prev) => {
      const s = prev[levelKey]; if (!s) return prev;
      const from = [...s[reviewing]]; if (!from.length) return prev;
      const cur = from.shift();
      const next = { ...s, [reviewing]: from };
      if (reviewing === "learning") {
        if (dir === "right") next.learned = [...s.learned, cur];
        else next.learning = [...from, cur];               // keep: rotate to back
      } else if (reviewing === "learned") {
        if (dir === "right") next.memorized = [...s.memorized, cur];
        else next.learned = [...from, cur];
      }
      return { ...prev, [levelKey]: next };
    });
    setFlipped(false); setDrag({ dx: 0, active: false }); setLeaving(null);
  }, [levelKey, reviewing]);

  const commit = useCallback((dir) => {
    if (!card || leaving) return;
    setLeaving(dir);
    setTimeout(() => applyResult(dir), T);
  }, [card, leaving, applyResult, T]);

  const canSwipe = reviewing !== "memorized";

  // pointer drag
  const onDown = (e) => {
    if (!canSwipe || leaving) return;
    startRef.current = { x: e.clientX, y: e.clientY, moved: false };
    setDrag({ dx: 0, active: true });
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (!drag.active) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    if (Math.hypot(dx, dy) > 8) startRef.current.moved = true;
    setDrag({ dx, active: true });
  };
  const onUp = () => {
    if (!drag.active) return;
    const { dx } = drag; const moved = startRef.current.moved;
    setDrag({ dx: moved ? dx : 0, active: false });
    if (!moved) { setFlipped((f) => !f); return; }
    const TH = 92;
    if (dx <= -TH) commit("left");
    else if (dx >= TH) commit("right");
    else setDrag({ dx: 0, active: false });
  };

  // keyboard
  useEffect(() => {
    if (screen !== "deck") return;
    const h = (e) => {
      if (e.key === "ArrowLeft" && canSwipe) { e.preventDefault(); commit("left"); }
      else if (e.key === "ArrowRight" && canSwipe) { e.preventDefault(); commit("right"); }
      else if ((e.key === " " || e.key === "Enter") && card) { e.preventDefault(); setFlipped((f) => !f); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [screen, canSwipe, commit, card]);

  useEffect(() => { setFlipped(false); }, [reviewing, direction, card?.id]);

  // persistence
  useEffect(() => {
    let alive = true;
    (async () => {
      if (STORE) {
        try { const r = await STORE.get(SKEY); if (alive && r && r.value) setSessions(reviveSessions(JSON.parse(r.value))); } catch (e) {}
        try { const p = await STORE.get(PKEY); if (alive && p && p.value) { const pr = JSON.parse(p.value); if (pr.direction) setDirection(pr.direction); } } catch (e) {}
      }
      if (alive) setLoaded(true);
    })();
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!loaded || !STORE) return;
    (async () => {
      try {
        const ser = {};
        for (const key of Object.keys(sessions)) {
          const s = sessions[key];
          ser[key] = { learning: s.learning.map((c) => c.id), learned: s.learned.map((c) => c.id), memorized: s.memorized.map((c) => c.id) };
        }
        await STORE.set(SKEY, JSON.stringify(ser));
      } catch (e) {}
    })();
  }, [sessions, loaded]);
  useEffect(() => {
    if (!loaded || !STORE) return;
    (async () => { try { await STORE.set(PKEY, JSON.stringify({ direction })); } catch (e) {} })();
  }, [direction, loaded]);

  const dx = drag.dx;
  const leftStrength = Math.max(0, Math.min(1, -dx / 92));
  const rightStrength = Math.max(0, Math.min(1, dx / 92));
  const outerStyle = leaving
    ? { transform: `translateX(${leaving === "left" ? -720 : 720}px) rotate(${leaving === "left" ? -16 : 16}deg)`, opacity: 0, transition: `transform ${T}ms ease, opacity ${T}ms ease` }
    : drag.active
    ? { transform: `translateX(${dx}px) rotate(${dx * 0.035}deg)`, transition: "none" }
    : { transform: "translateX(0) rotate(0)", transition: "transform 260ms cubic-bezier(.2,.8,.2,1)" };

  const advanceLabel = reviewing === "learning" ? "Learned" : "Memorized";

  if (!loaded) return (<div className="bj-root"><style>{CSS}</style><div className="bj-loading">Baraja</div></div>);

  return (
    <div className="bj-root">
      <style>{CSS}</style>

      {screen === "home" && (
        <div className="bj-home">
          <header className="bj-hero">
            <div className="bj-brand">Baraja</div>
            <p className="bj-tag">Spanish vocabulary, one swipe at a time.</p>
          </header>
          <div className="bj-decks">
            {LEVELS.map((lv) => {
              const s = sessions[lv.key];
              const total = VOCAB[lv.key].length;
              return (
                <button key={lv.key} className="bj-deck" style={{ "--suit": SUIT_COLOR[lv.suit] }} onClick={() => startLevel(lv.key)}>
                  <span className="bj-deck-frame" aria-hidden="true">
                    <span className="bj-pinta"><Suit suit={lv.suit} size={18} color="var(--suit)" /></span>
                  </span>
                  <span className="bj-deck-code">{lv.key}</span>
                  <span className="bj-deck-name">{lv.name}</span>
                  <span className="bj-deck-meta">
                    {s ? `${s.learning.length} to learn · ${s.learned.length + s.memorized.length} done` : `${total} words`}
                  </span>
                  <span className="bj-deck-cta">{s ? "Resume" : "Start learning"}</span>
                </button>
              );
            })}
          </div>
          <p className="bj-note">Your progress saves automatically, so you can pick up where you left off. Tap a card to flip it; swipe right when you know a word, left to keep it in rotation.</p>
          {Object.keys(sessions).length > 0 && (
            <button className="bj-reset" onClick={() => (resetArmed ? resetAll() : setResetArmed(true))}>
              {resetArmed ? "Tap again to erase all progress" : "Reset all progress"}
            </button>
          )}
        </div>
      )}

      {screen === "deck" && sess && (
        <div className="bj-deckview">
          <div className="bj-topbar">
            <button className="bj-tohome" onClick={() => setScreen("home")} aria-label="Back to levels">← Levels</button>
            <div className="bj-level"><Suit suit={suit} size={16} color={SUIT_COLOR[suit]} /><span>{levelKey}</span></div>
            <button className="bj-dir" onClick={() => setDirection((d) => (d === "es-en" ? "en-es" : "es-en"))}>
              {direction === "es-en" ? "ES → EN" : "EN → ES"}
            </button>
          </div>

          <div className="bj-tabs" role="tablist">
            {[["learning", "Learning"], ["learned", "Learned"], ["memorized", "Memorized"]].map(([k, label]) => (
              <button key={k} role="tab" aria-selected={reviewing === k}
                className={"bj-tab" + (reviewing === k ? " is-active" : "")} onClick={() => setReviewing(k)}>
                <span>{label}</span><b>{sess[k].length}</b>
              </button>
            ))}
          </div>

          <div className="bj-stage">
            {reviewing === "memorized" ? (
              <div className="bj-mem">
                {sess.memorized.length === 0
                  ? <div className="bj-empty"><Suit suit={suit} size={34} color="var(--parch-edge)" /><p>Words you master collect here.<br /><small>Swipe left in the Learned pile to add one.</small></p></div>
                  : <ul className="bj-memlist">{sess.memorized.map((c) => <li key={c.id}><b>{c.word}</b><span>{c.meaning}</span></li>)}</ul>}
              </div>
            ) : !card ? (
              <div className="bj-empty">
                <Suit suit={suit} size={34} color="var(--parch-edge)" />
                {reviewing === "learning"
                  ? <p>Learning deck cleared.<br /><small>Open the Learned pile to review, or restart.</small></p>
                  : <p>Nothing to review yet.<br /><small>Swipe words left from Learning to fill this pile.</small></p>}
                {reviewing === "learning" && <button className="bj-restart" onClick={restart}>Restart level</button>}
              </div>
            ) : (
              <div className="bj-cardwrap">
                {pile.slice(1, 3).reverse().map((c, i, arr) => {
                  const depth = arr.length - i;
                  return <div key={c.id} className="bj-card bj-ghost" style={{ transform: `translateY(${depth * 8}px) scale(${1 - depth * 0.035})`, zIndex: 1 }} aria-hidden="true" />;
                })}

                <div className={"bj-card bj-live" + (flipped ? " is-flip" : "")} style={{ ...outerStyle, zIndex: 5, "--suit": SUIT_COLOR[suit] }}
                     onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
                     role="button" tabIndex={0} aria-label="Flashcard, activate to flip">
                  <div className="bj-badge bj-badge-l" style={{ opacity: leftStrength }}>Keep</div>
                  <div className="bj-badge bj-badge-r" style={{ opacity: rightStrength }}>{advanceLabel}</div>
                  <div className="bj-inner">
                    <FaceFront card={card} direction={direction} suit={suit} />
                    <FaceBack card={card} direction={direction} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {reviewing !== "memorized" && card && (
            <div className="bj-hints">
              <span className="bj-hint bj-hint-l">‹ Keep</span>
              <span className="bj-hint-tap">tap to flip</span>
              <span className="bj-hint bj-hint-r">{advanceLabel} ›</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Corner({ suit }) {
  return <span className="bj-corner"><Suit suit={suit} size={13} color="var(--suit)" /></span>;
}
function FaceFront({ card, direction, suit }) {
  const spanishFirst = direction === "es-en";
  return (
    <div className="bj-face bj-front">
      <Corner suit={suit} /><Corner suit={suit} />
      {spanishFirst ? (
        <>
          <div className="bj-word">{card.word}</div>
          <div className="bj-chip">{posLabel(card.pos)}{card.gender ? ` · ${card.gender}` : ""}</div>
        </>
      ) : (
        <>
          <div className="bj-mean-front">{card.meaning}</div>
          <div className="bj-chip">{posLabel(card.pos)}</div>
        </>
      )}
    </div>
  );
}
function FaceBack({ card, direction }) {
  const spanishFirst = direction === "es-en";
  return (
    <div className="bj-face bj-back">
      {spanishFirst
        ? <div className="bj-answer">{card.meaning}</div>
        : <div className="bj-answer bj-answer-es">{card.word}</div>}
      <div className="bj-ex">
        <p className="bj-ex-es">{card.example_es}</p>
        <p className="bj-ex-en">{card.example_en}</p>
      </div>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Piazzolla:opsz,wght@8..30,500;8..30,700;8..30,800&family=Mulish:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
.bj-root{--felt:#204238;--felt-2:#183129;--parch:#F4ECD8;--parch-edge:#E4D6B4;--ink:#2A2620;--ink-soft:#7A6F58;--oro:#C39A38;--oro-deep:#9C7A22;--copa:#B23A2C;--espada:#3D6B88;--basto:#4F7A3C;--line:rgba(42,38,32,.16);
  font-family:'Mulish',system-ui,sans-serif;color:var(--ink);
  background:radial-gradient(120% 90% at 50% 0%,var(--felt) 0%,var(--felt-2) 100%);
  min-height:100%;width:100%;box-sizing:border-box;-webkit-font-smoothing:antialiased;}
.bj-root *{box-sizing:border-box;}
.bj-root button{font-family:inherit;cursor:pointer;border:none;background:none;color:inherit;}

/* HOME */
.bj-home{max-width:560px;margin:0 auto;padding:40px 22px 30px;}
.bj-hero{text-align:center;margin-bottom:30px;}
.bj-brand{font-family:'Piazzolla',serif;font-weight:800;font-size:52px;letter-spacing:.01em;color:var(--parch);line-height:1;}
.bj-tag{margin:.5em 0 0;color:var(--parch-edge);font-size:15px;font-weight:500;opacity:.85;}
.bj-decks{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
.bj-deck{position:relative;text-align:left;background:var(--parch);border-radius:12px;padding:18px 16px 16px;
  box-shadow:0 10px 24px rgba(0,0,0,.28),0 2px 0 rgba(255,255,255,.35) inset;display:flex;flex-direction:column;gap:2px;
  transition:transform .18s ease,box-shadow .18s ease;overflow:hidden;}
.bj-deck:hover{transform:translateY(-4px);box-shadow:0 16px 30px rgba(0,0,0,.34);}
.bj-deck:focus-visible{outline:3px solid var(--oro);outline-offset:2px;}
.bj-deck-frame{position:absolute;inset:7px;border:1.5px solid var(--suit);border-radius:8px;opacity:.5;pointer-events:none;}
.bj-pinta{position:absolute;top:-9px;left:50%;transform:translateX(-50%);background:var(--parch);padding:0 5px;}
.bj-deck-code{font-family:'Piazzolla',serif;font-weight:800;font-size:34px;color:var(--suit);line-height:1;margin-top:6px;}
.bj-deck-name{font-weight:700;font-size:14px;margin-top:2px;}
.bj-deck-meta{font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--ink-soft);margin-top:4px;}
.bj-deck-cta{margin-top:12px;font-size:12.5px;font-weight:700;color:var(--oro-deep);text-transform:uppercase;letter-spacing:.05em;}
.bj-note{color:var(--parch-edge);opacity:.7;font-size:12.5px;text-align:center;margin-top:26px;line-height:1.5;}

/* DECK VIEW */
.bj-deckview{max-width:460px;margin:0 auto;padding:14px 18px 22px;display:flex;flex-direction:column;min-height:100%;}
.bj-topbar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px;}
.bj-tohome{display:flex;align-items:center;gap:5px;font-family:'IBM Plex Mono',monospace;font-size:13px;font-weight:700;color:var(--felt);background:var(--parch);padding:7px 14px 7px 11px;border-radius:20px;letter-spacing:.03em;box-shadow:0 2px 8px rgba(0,0,0,.28);}
.bj-tohome:hover{background:#fff;box-shadow:0 3px 12px rgba(0,0,0,.35);}
.bj-level{display:flex;align-items:center;gap:7px;color:var(--parch);font-family:'Piazzolla',serif;font-weight:700;font-size:18px;}
.bj-dir{font-family:'IBM Plex Mono',monospace;font-size:13px;color:var(--felt);background:var(--parch);
  padding:7px 13px;border-radius:20px;font-weight:700;letter-spacing:.03em;box-shadow:0 2px 8px rgba(0,0,0,.28);}
.bj-dir:hover{background:#fff;box-shadow:0 3px 12px rgba(0,0,0,.35);}
.bj-tabs{display:flex;gap:6px;background:#3A6154;padding:5px;border-radius:12px;margin-bottom:20px;}
.bj-tab{flex:1;display:flex;flex-direction:column;align-items:center;gap:1px;padding:8px 4px;border-radius:8px;
  color:#FBF6E9;opacity:.8;font-size:11.5px;font-weight:600;letter-spacing:.02em;transition:background .16s,opacity .16s,color .16s;}
.bj-tab:hover{opacity:1;}
.bj-tab b{font-family:'IBM Plex Mono',monospace;font-size:16px;font-weight:500;}
.bj-tab.is-active{background:var(--parch);color:var(--ink);opacity:1;}
.bj-tab:focus-visible{outline:2px solid var(--oro);}

.bj-stage{flex:1;display:flex;align-items:center;justify-content:center;min-height:340px;}
.bj-cardwrap{position:relative;width:100%;max-width:330px;height:420px;}
.bj-card{position:absolute;inset:0;border-radius:16px;background:var(--parch);
  box-shadow:0 14px 34px rgba(0,0,0,.34);}
.bj-ghost{background:linear-gradient(180deg,#efe6cd,#e7dcbf);box-shadow:0 8px 20px rgba(0,0,0,.24);}
.bj-live{touch-action:none;-webkit-user-select:none;user-select:none;perspective:1200px;cursor:grab;}
.bj-live:active{cursor:grabbing;}
.bj-live:focus-visible{outline:3px solid var(--oro);outline-offset:3px;}
.bj-inner{position:absolute;inset:0;transform-style:preserve-3d;transition:transform .5s cubic-bezier(.4,.15,.2,1);}
.bj-live.is-flip .bj-inner{transform:rotateY(180deg);}
.bj-face{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;
  display:flex;flex-direction:column;align-items:center;justify-content:center;padding:30px;text-align:center;
  border-radius:16px;border:1.5px solid var(--parch-edge);}
.bj-front{box-shadow:inset 0 0 0 5px var(--parch),inset 0 0 0 6.5px color-mix(in srgb,var(--suit) 55%,transparent);}
.bj-corner{position:absolute;top:14px;left:14px;}
.bj-corner:nth-of-type(2){top:auto;left:auto;bottom:14px;right:14px;transform:rotate(180deg);}
.bj-word{font-family:'Piazzolla',serif;font-weight:700;font-size:38px;line-height:1.1;color:var(--ink);width:100%;}
.bj-chip{margin-top:14px;font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--ink-soft);
  border:1px solid var(--line);border-radius:20px;padding:4px 11px;letter-spacing:.03em;}
.bj-mean-front{font-family:'Piazzolla',serif;font-weight:500;font-size:27px;line-height:1.25;color:var(--ink);width:100%;}
.bj-back{transform:rotateY(180deg);justify-content:flex-start;padding-top:44px;}
.bj-answer{font-family:'Piazzolla',serif;font-weight:700;font-size:24px;line-height:1.25;color:var(--ink);width:100%;}
.bj-answer-es{font-size:30px;}
.bj-ex{margin-top:22px;padding-top:20px;border-top:1px solid var(--line);width:100%;}
.bj-ex-es{font-size:17px;font-weight:600;color:var(--ink);margin:0;line-height:1.4;}
.bj-ex-en{font-size:14px;color:var(--ink-soft);margin:8px 0 0;line-height:1.4;font-style:italic;}
.bj-badge{position:absolute;top:20px;padding:6px 13px;border-radius:8px;font-weight:800;font-size:13px;letter-spacing:.06em;
  text-transform:uppercase;z-index:9;pointer-events:none;transition:opacity .1s;}
.bj-badge-l{left:18px;color:#fff;background:var(--copa);transform:rotate(-8deg);}
.bj-badge-r{right:18px;color:#fff;background:var(--oro-deep);transform:rotate(8deg);}

.bj-hints{display:flex;align-items:center;justify-content:space-between;margin-top:20px;padding:0 4px;
  font-size:12.5px;font-weight:700;}
.bj-hint-l{color:#e59b8f;}
.bj-hint-r{color:var(--oro);}
.bj-hint-tap{font-family:'IBM Plex Mono',monospace;font-weight:400;font-size:11px;color:var(--parch-edge);opacity:.7;}

.bj-empty{text-align:center;color:var(--parch-edge);display:flex;flex-direction:column;align-items:center;gap:16px;}
.bj-empty p{margin:0;font-size:16px;line-height:1.5;font-weight:600;}
.bj-empty small{font-weight:400;opacity:.75;font-size:13px;}
.bj-restart{margin-top:4px;background:var(--parch);color:var(--ink);font-weight:700;font-size:13px;padding:10px 18px;border-radius:22px;}
.bj-mem{width:100%;max-width:330px;align-self:flex-start;margin:0 auto;}
.bj-memlist{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px;}
.bj-memlist li{background:var(--parch);border-radius:10px;padding:12px 15px;display:flex;flex-direction:column;gap:2px;
  box-shadow:0 6px 16px rgba(0,0,0,.2);}
.bj-memlist b{font-family:'Piazzolla',serif;font-size:18px;}
.bj-memlist span{font-size:13px;color:var(--ink-soft);}

.bj-loading{min-height:60vh;display:flex;align-items:center;justify-content:center;font-family:'Piazzolla',serif;font-weight:800;font-size:46px;color:var(--parch);opacity:.45;letter-spacing:.02em;}
.bj-reset{display:block;margin:16px auto 0;color:var(--parch-edge);opacity:.55;font-size:12px;text-decoration:underline;background:none;}
.bj-reset:hover{opacity:1;}
@media (max-width:400px){.bj-decks{grid-template-columns:1fr 1fr;gap:12px;}.bj-brand{font-size:44px;}.bj-cardwrap{height:390px;}}
@media (prefers-reduced-motion:reduce){.bj-inner,.bj-deck{transition:none!important;}}
`;
