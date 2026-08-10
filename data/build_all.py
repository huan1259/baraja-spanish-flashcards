#!/usr/bin/env python3
"""
Build A1-B2 Spanish vocab decks from doozan/spanish_data with balanced POS
composition. Frequency backbone, per-POS quotas, primary-sense trim,
shortest-sentence-containing-lemma example.
"""
import csv, re, json, sys
from collections import defaultdict

DATA = "/home/claude/spanish_data"
OUT = "/mnt/user-data/outputs"
CONTENT_POS = ["n", "v", "adj", "adv"]
POS_LABEL = {"n": "noun", "v": "verb", "adj": "adjective", "adv": "adverb"}
LEVELS = ["A1", "A2", "B1", "B2"]
QUOTAS = {
    "A1": {"n": 165, "v": 80,  "adj": 40,  "adv": 15},
    "A2": {"n": 287, "v": 120, "adj": 75,  "adv": 18},
    "B1": {"n": 365, "v": 120, "adj": 100, "adv": 15},
    "B2": {"n": 383, "v": 100, "adj": 105, "adv": 12},
}

# ---------- 1. RANKED PER-POS LISTS (dedupe by lemma -> dominant POS) ----------
ranked = {p: [] for p in CONTENT_POS}     # pos -> [lemma, ...] in frequency order
rank_of = {}                               # lemma -> global frequency rank
seen = set()
gi = 0
with open(f"{DATA}/frequency.csv", newline="", encoding="utf-8") as f:
    for row in csv.DictReader(f):
        lemma, pos, flags = row["spanish"], row["pos"], row["flags"]
        if pos not in CONTENT_POS or "DUPLICATE" in flags:
            continue
        if not re.fullmatch(r"[a-záéíóúñü]+", lemma) or lemma in seen:
            continue
        seen.add(lemma)
        ranked[pos].append(lemma)
        rank_of[lemma] = gi
        gi += 1
target = set(seen)
print("Available per POS:", {p: len(ranked[p]) for p in CONTENT_POS}, file=sys.stderr)

# ---------- 2. DICTIONARY: primary gloss + gender for target lemmas ----------
dict_data = {}
def clean_gloss(g):
    g = re.sub(r"\(#.*$", "", g)
    g = re.sub(r"\s+", " ", g).strip(" ;,")
    return g
with open(f"{DATA}/es-en.data", encoding="utf-8") as f:
    word = None; cur = None
    for line in f:
        line = line.rstrip("\n")
        if line == "_____":
            word = None; cur = None
        elif word is None and line and not line.startswith(" "):
            word = line if line in target else None
            if word: dict_data.setdefault(word, {})
        elif word:
            s = line.strip()
            if line.startswith("pos: "):
                cur = line[5:].strip(); dict_data[word].setdefault(cur, {"gloss": None, "g": None})
            elif cur and s.startswith("g: "):
                dict_data[word][cur]["g"] = s[3:].strip()
            elif cur and s.startswith("gloss: ") and dict_data[word][cur]["gloss"] is None:
                dict_data[word][cur]["gloss"] = clean_gloss(s[7:])

# ---------- 3. SHORTEST SENTENCE PER LEMMA (single streaming pass) ----------
best = {}
tag_re = re.compile(r":([a-z-]+),([^ ]+)")
with open(f"{DATA}/sentences.tsv", encoding="utf-8") as f:
    for line in f:
        parts = line.rstrip("\n").split("\t")
        if len(parts) < 6: continue
        en, es, tagged = parts[0], parts[1], parts[5]
        wc = len(es.split())
        if wc < 2: continue
        present = set()
        for _, toks in tag_re.findall(tagged):
            for tok in toks.split(","):
                present.add(tok.split("|")[-1])
        for lem in present & target:
            if lem not in best or wc < best[lem][0] or (wc == best[lem][0] and len(es) < len(best[lem][1])):
                best[lem] = (wc, es, en)

# ---------- 4. VALID LISTS + QUOTA DRAW ----------
def has_gloss(lemma, pos): 
    return dict_data.get(lemma, {}).get(pos, {}).get("gloss")
drop_gloss = defaultdict(int); drop_sent = defaultdict(int)
valid = {p: [] for p in CONTENT_POS}
for p in CONTENT_POS:
    for lemma in ranked[p]:
        if not has_gloss(lemma, p): drop_gloss[p] += 1; continue
        if lemma not in best:       drop_sent[p]  += 1; continue
        valid[p].append(lemma)

assign = {lv: [] for lv in LEVELS}
shortfall = {}
for p in CONTENT_POS:
    cur = 0
    for lv in LEVELS:
        q = QUOTAS[lv][p]
        take = valid[p][cur:cur+q]
        cur += len(take)
        if len(take) < q: shortfall[(lv, p)] = (len(take), q)
        for lemma in take: assign[lv].append((lemma, p))

# ---------- 5. ASSEMBLE + WRITE ----------
# Feminine singular nouns that take 'el'/'un' due to a stressed initial a-/ha-.
EL_FEM = {"agua","águila","ala","alba","alga","alma","ama","ancla","ansia","arca",
          "área","arma","arpa","asa","asma","aula","ave","hacha","hada","hambre",
          "haya","haz","acta","aya","ágata","ánsar"}
def norm_gender(raw):
    if not raw: return None
    r = raw.strip()
    if r in ("f-p", "m-p"): return r          # plural-only
    base = r.split(";")[0].split("<")[0].strip()
    if base in ("mf", "mfbysense", "mfequiv", "m-f") or (base.startswith("m") and "f" in base):
        return "mf"                            # common gender: el/la
    if base.startswith("m"): return "m"
    if base.startswith("f"): return "f"
    return None
def article(g, lemma):
    if g == "m":  return "el"
    if g == "f":  return "el" if lemma in EL_FEM else "la"
    if g == "mf": return "el/la"
    return ""                                  # plural-only / unknown
def build(lemma, pos):
    d = dict_data[lemma][pos]
    gender = norm_gender(d["g"]) if pos == "n" else None
    art = article(gender, lemma) if pos == "n" else ""
    display = f"{art} {lemma}" if art else lemma
    wc, es, en = best[lemma]
    return {"word": display, "lemma": lemma, "pos": POS_LABEL[pos], "gender": gender,
            "meaning": d["gloss"], "example_es": es, "example_en": en}

allrows = []
for lv in LEVELS:
    rows = [build(l, p) for l, p in assign[lv]]
    rows.sort(key=lambda r: rank_of[r["lemma"]])   # flow most->least common within level
    for r in rows: r_lv = dict(r, level=lv); allrows.append(r_lv)
    json.dump(rows, open(f"{OUT}/vocab_{lv}.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
json.dump(allrows, open(f"{OUT}/vocab_all.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)

# ---------- 6. REPORT ----------
print("\n===== COVERAGE BY LEVEL =====")
print(f"{'level':>5} | {'noun':>6} {'verb':>6} {'adj':>6} {'adv':>6} | {'total':>6}")
for lv in LEVELS:
    c = {p: sum(1 for _, q in assign[lv] if q == p) for p in CONTENT_POS}
    print(f"{lv:>5} | {c['n']:>6} {c['v']:>6} {c['adj']:>6} {c['adv']:>6} | {sum(c.values()):>6}")
print(f"{'ALL':>5} | " + " ".join(f"{sum(1 for _,q in sum(assign.values(),[]) if q==p):>6}" for p in CONTENT_POS)
      + f" | {len(allrows):>6}")
print("\nDropped (no primary gloss for POS):", dict(drop_gloss))
print("Dropped (no example sentence):     ", dict(drop_sent))
if shortfall: print("SHORTFALLS (ran out of valid words):", shortfall)
else: print("No shortfalls — every level/POS quota filled.")

# spot-check: a few entries spanning each level
print("\n===== SPOT CHECK (first + middle + last of each level) =====")
for lv in LEVELS:
    rows = json.load(open(f"{OUT}/vocab_{lv}.json", encoding="utf-8"))
    for idx in (0, len(rows)//2, len(rows)-1):
        e = rows[idx]
        print(f"[{lv} #{idx:>3}] {e['word']:16} {e['meaning'][:38]:38} | {e['example_es']}")
