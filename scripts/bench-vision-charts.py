"""
Charts of the vision benchmark (matplotlib), drawn ONLY from measured data:
    node scripts/bench-vision.cjs          # runs the benchmark, then this script
    python scripts/bench-vision-charts.py  # charts again from docs/vision-approaches/results.json
Output: docs/vision-approaches/*.png
Requirements: scripts/bench-vision-requirements.txt (matplotlib).
"""
import json
import statistics
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "vision-approaches"
DATA = json.loads((OUT / "results.json").read_text(encoding="utf-8"))

# Reference palette (validated: categorical slots 1-3 pass CVD/normal-vision checks on the light surface;
# slot 3 is below 3:1 contrast, so every bar carries a visible value label).
SURFACE = "#fcfcfb"
INK = "#0b0b0b"
INK_2 = "#52514e"
MUTED = "#898781"
GRID = "#e1e0d9"
SERIES = ["#2a78d6", "#eb6834", "#1baf7a"]
GOOD = "#0ca30c"
CRITICAL = "#d03b3b"

plt.rcParams.update({
    "figure.facecolor": SURFACE,
    "axes.facecolor": SURFACE,
    "savefig.facecolor": SURFACE,
    "axes.edgecolor": GRID,
    "axes.labelcolor": INK_2,
    "axes.titlecolor": INK,
    "axes.titlesize": 14,
    "axes.titleweight": "bold",
    "axes.titlelocation": "left",
    "axes.titlepad": 14,
    "axes.labelsize": 11,
    "xtick.color": MUTED,
    "ytick.color": INK_2,
    "xtick.labelsize": 10,
    "ytick.labelsize": 11,
    "axes.spines.top": False,
    "axes.spines.right": False,
    "axes.grid": False,
    "font.family": "DejaVu Sans",
})

TECHNIQUE_ES = {
    "template ZNCC": "Plantilla ZNCC",
    "template seeded by Hough": "Plantilla guiada por Hough",
    "Hough circles": "Hough (círculos)",
    "segmentation": "Segmentación",
}


def case_es(name: str) -> str:
    if name.startswith("NEG"):
        return {"button covered": "Sin botón:\ntapado", "top part": "Sin botón:\nparte sup.", "side artwork": "Sin botón:\ndecorado"}[
            next(k for k in ("button covered", "top part", "side artwork") if k in name)
        ]
    scale = name.split("×")[-1]
    base = "Intro" if name.startswith("intro (black") else "Juego" if name.startswith("playable") else "Intro 2"
    return f"{base}\n×{scale}"


def subtitle(ax, text):
    ax.text(0, 1.0, text, transform=ax.transAxes, fontsize=10, color=INK_2, va="bottom", ha="left")


def save(fig, name):
    path = OUT / name
    fig.savefig(path, dpi=170, bbox_inches="tight", pad_inches=0.3)
    plt.close(fig)
    print(f"  {path.relative_to(ROOT)}")


spin = DATA["spinButton"]
cases = spin["cases"]
techniques = list(dict.fromkeys(r["technique"] for r in cases))
positive = lambda r: r["verdict"] in ("HIT", "MISS")  # noqa: E731


def summary(t):
    mine = [r for r in cases if r["technique"] == t]
    pos = [r for r in mine if positive(r)]
    neg = [r for r in mine if not positive(r)]
    hits = [r for r in pos if r["verdict"] == "HIT"]
    return {
        "hits": len(hits),
        "pos": len(pos),
        "fp": sum(r["verdict"] == "FALSE+" for r in neg),
        "neg": len(neg),
        "median_ms": statistics.median(r["ms"] for r in pos),
        "max_ms": max(r["ms"] for r in pos),
        "dist": statistics.mean(r["dist"] for r in hits) if hits else None,
    }


S = {t: summary(t) for t in techniques}
print("Charts:")

# 1) Trade-off: reliability vs speed (log time) ------------------------------------------------------------------
fig, ax = plt.subplots(figsize=(9, 5.4))
ax.axhspan(80, 125, xmin=0, xmax=0.62, color=GOOD, alpha=0.06, zorder=0)
ax.text(12, 82, "zona ideal: fiable y rápido", fontsize=9, color=GOOD, va="bottom")
# labels alternate above/below so points at the same height never collide
placement = {"template ZNCC": "above", "template seeded by Hough": "below", "Hough circles": "above", "segmentation": "right"}
for t in techniques:
    s = S[t]
    rate = 100 * s["hits"] / s["pos"]
    ax.scatter(s["median_ms"], rate, s=150, color=SERIES[0], edgecolor=SURFACE, linewidth=2, zorder=3)
    where = placement.get(t, "right")
    xytext, ha, va = {"above": ((0, 12), "center", "bottom"), "below": ((0, -14), "center", "top"), "right": ((12, 0), "left", "center")}[where]
    ax.annotate(f"{TECHNIQUE_ES[t]}\n{s['hits']}/{s['pos']} · {s['median_ms']:.0f} ms", (s["median_ms"], rate), xytext=xytext,
                textcoords="offset points", ha=ha, va=va, fontsize=10, color=INK)
ax.set_xscale("log")
ax.set_xlim(10, 20000)
ax.set_ylim(0, 125)
ax.set_yticks(range(0, 101, 20))
ax.set_xlabel("Tiempo de la primera búsqueda (ms, mediana, escala logarítmica) — más a la izquierda es más rápido")
ax.set_ylabel("Aciertos (%)")
ax.yaxis.grid(True, color=GRID, linewidth=0.8)
ax.set_axisbelow(True)
ax.set_title("Botón de tirar: fiabilidad frente a velocidad", pad=28)
subtitle(ax, f"{spin['positives']} casos con botón (3 fotogramas reales × 3 tamaños) · ninguna técnica dio falsos positivos en {spin['negatives']} casos sin botón")
save(fig, "01-fiabilidad-vs-velocidad.png")

# 2) Hits ---------------------------------------------------------------------------------------------------------
fig, ax = plt.subplots(figsize=(9, 3.8))
names = [TECHNIQUE_ES[t] for t in techniques][::-1]
hits = [S[t]["hits"] for t in techniques][::-1]
total = S[techniques[0]]["pos"]
bars = ax.barh(names, hits, color=SERIES[0], height=0.55)
for b, t in zip(bars, techniques[::-1]):
    s = S[t]
    err = f" · error medio {s['dist']:.2f} radios" if s["dist"] is not None else ""
    ax.text(b.get_width() + 0.12, b.get_y() + b.get_height() / 2, f"{s['hits']}/{s['pos']}{err} · {s['fp']}/{s['neg']} falsos positivos",
            va="center", fontsize=10, color=INK)
ax.set_xlim(0, total + 4.5)
ax.set_xticks(range(0, total + 1, 3))
ax.set_xlabel(f"Aciertos (de {total} casos con botón)")
ax.xaxis.grid(True, color=GRID, linewidth=0.8)
ax.set_axisbelow(True)
ax.set_title("Botón de tirar: aciertos por técnica", pad=28)
subtitle(ax, "Acierto = el centro detectado cae a menos de 0,6 radios del centro real (el clic cae dentro del botón)")
save(fig, "02-aciertos.png")

# 3) Time (median + max) ------------------------------------------------------------------------------------------
fig, ax = plt.subplots(figsize=(9, 3.8))
med = [S[t]["median_ms"] for t in techniques][::-1]
mx = [S[t]["max_ms"] for t in techniques][::-1]
bars = ax.barh(names, med, color=SERIES[0], height=0.55, label="mediana")
ax.scatter(mx, [b.get_y() + b.get_height() / 2 for b in bars], marker="|", s=260, color=INK_2, linewidth=2, zorder=3, label="máximo")
for b, m, x in zip(bars, med, mx):
    ax.text(max(x, m) * 1.25, b.get_y() + b.get_height() / 2, f"{m:.0f} ms (máx. {x:.0f})", va="center", fontsize=10, color=INK)
ax.set_xscale("log")
ax.set_xlim(10, 60000)
ax.set_xlabel("ms (escala logarítmica) — menos es mejor")
ax.xaxis.grid(True, color=GRID, linewidth=0.8, which="major")
ax.set_axisbelow(True)
ax.legend(loc="lower right", frameon=False, fontsize=9)
ax.set_title("Botón de tirar: tiempo de la primera búsqueda", pad=28)
subtitle(ax, "Después de encontrarlo, la plantilla vuelve a comprobar solo donde estaba: milisegundos")
save(fig, "03-tiempo.png")

# 4) Case map: technique × case ----------------------------------------------------------------------------------
case_names = list(dict.fromkeys(r["case"] for r in cases))
fig, ax = plt.subplots(figsize=(13, 3.9))
for i, t in enumerate(techniques):
    for j, c in enumerate(case_names):
        r = next(r for r in cases if r["technique"] == t and r["case"] == c)
        ok = r["verdict"] in ("HIT", "OK-NONE")
        ax.add_patch(plt.Rectangle((j + 0.04, i + 0.06), 0.92, 0.88, color=GOOD if ok else CRITICAL, alpha=0.18 if ok else 0.22, linewidth=0))
        label = {"HIT": "✓", "OK-NONE": "✓ nada", "MISS": "✗ falla", "FALSE+": "✗ clic\nfalso"}[r["verdict"]]
        if r["verdict"] == "HIT":
            label += f"\n{r['dist']:.2f}"
        ax.text(j + 0.5, i + 0.5, label, ha="center", va="center", fontsize=9, color=GOOD if ok else CRITICAL, fontweight="bold")
ax.axvline(spin["positives"], color=INK_2, linewidth=1.2)
ax.set_xlim(0, len(case_names))
ax.set_ylim(len(techniques), 0)
ax.set_xticks([j + 0.5 for j in range(len(case_names))])
ax.set_xticklabels([case_es(c) for c in case_names], fontsize=9)
ax.set_yticks([i + 0.5 for i in range(len(techniques))])
ax.set_yticklabels([TECHNIQUE_ES[t] for t in techniques])
ax.tick_params(length=0)
for side in ("left", "bottom"):
    ax.spines[side].set_visible(False)
ax.set_title("Botón de tirar: resultado en cada caso", pad=28)
subtitle(ax, "✓ = encontrado (con el error en radios) o, si no hay botón, correctamente nada · ✗ = no lo encuentra o hace clic donde no hay botón")
save(fig, "04-mapa-de-casos.png")

# 5) HUD OCR -----------------------------------------------------------------------------------------------------
hud = DATA.get("hudOcr", [])
if hud:
    modes = list(dict.fromkeys(r["mode"] for r in hud))
    regions = list(dict.fromkeys(r["region"] for r in hud))
    mode_es = {"plain (contrast + invert)": "OCR normal", "binarised ≥180": "Binarizado ≥ 180", "binarised ≥210": "Binarizado ≥ 210"}
    region_es = {"HUD band 20%": "franja del HUD 20 %", "HUD band 10%": "franja del HUD 10 %"}
    fig, ax = plt.subplots(figsize=(9, 4.3))
    width = 0.36
    for k, reg in enumerate(regions):
        xs = [i + (k - 0.5) * width for i in range(len(modes))]
        rows = [next(r for r in hud if r["mode"] == m and r["region"] == reg) for m in modes]
        bars = ax.bar(xs, [r["ms"] for r in rows], width=width * 0.94, color=SERIES[k], label=region_es.get(reg, reg))
        for b, r in zip(bars, rows):
            ok = r["correct"] == "YES"
            ax.text(b.get_x() + b.get_width() / 2, b.get_height() + 12, f"{'✓' if ok else '✗'} {r['ms']} ms\n{r['CREDIT']} / {r['BET']}",
                    ha="center", va="bottom", fontsize=9, color=GOOD if ok else CRITICAL, fontweight="bold")
    ax.set_xticks(range(len(modes)))
    ax.set_xticklabels([mode_es.get(m, m) for m in modes])
    ax.set_ylabel("ms por lectura")
    ax.set_ylim(0, max(r["ms"] for r in hud) * 1.45)
    ax.yaxis.grid(True, color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    ax.legend(frameon=False, loc="upper right", fontsize=9)
    ax.set_title("Leer CRÉDITO y APUESTA: el preprocesado decide", pad=28)
    subtitle(ax, "Verdad: CRÉDITO 99,90 € · APUESTA 2,00 €  ·  ✓ = lee los dos bien  ·  debajo: lo que leyó (CRÉDITO / APUESTA)")
    save(fig, "05-ocr-hud.png")

# 6) Motion ------------------------------------------------------------------------------------------------------
motion = DATA.get("motion", [])
if motion:
    pair_es = {"same frame": "Mismo\nfotograma", "recompressed (noise)": "Ruido de\ncompresión", "1–2 px jitter": "Temblor\n1–2 px", "intro → playable (real change)": "Cambio real\n(intro → juego)"}
    fig, ax = plt.subplots(figsize=(9, 4.2))
    vals = [m["diff"] for m in motion]
    bars = ax.bar([pair_es.get(m["pair"], m["pair"]) for m in motion], vals, color=SERIES[0], width=0.55)
    noise = max(vals[:-1])
    real = vals[-1]
    ax.axhspan(noise, real, color=GOOD, alpha=0.07)
    ax.text(len(vals) - 1.55, (noise + real) / 2, f"margen para el umbral\n×{real / max(noise, 1e-3):.0f}", ha="center", va="center", fontsize=9, color=GOOD)
    for b, v in zip(bars, vals):
        ax.text(b.get_x() + b.get_width() / 2, v + 0.004, f"{v:.3f}", ha="center", va="bottom", fontsize=10, color=INK)
    ax.set_ylabel("Fracción de píxeles que cambian")
    ax.set_ylim(0, real * 1.25)
    ax.yaxis.grid(True, color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    ax.set_title("Saber si los rodillos se mueven: diferencia de fotogramas", pad=28)
    subtitle(ax, "El umbral se pone por encima del ruido en reposo medido en cada partida (3× el ruido)")
    save(fig, "06-movimiento.png")

print(f"Data: {DATA.get('generatedAt', '?')}", file=sys.stderr)
