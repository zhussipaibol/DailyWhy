// «Симпозиум» — раздел про философию: один вопрос, несколько философов за одним столом.
// Подключается после app.js. Отдаёт window.Symposium = { index(app), issue(app, slug) }.
(() => {
  "use strict";

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
  const ROMAN = (n) => {
    const t = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
    let s = ""; for (const [v, r] of t) while (n >= v) { s += r; n -= v; } return s;
  };
  const plural = (n, one, few, many) => {
    const m = n % 10, h = n % 100;
    return `${n} ${(m === 1 && h !== 11) ? one : (m >= 2 && m <= 4 && (h < 12 || h > 14)) ? few : many}`;
  };
  const minutes = (n) => {
    const m = n % 10, h = n % 100;
    const w = (m === 1 && h !== 11) ? "минута" : (m >= 2 && m <= 4 && (h < 12 || h > 14)) ? "минуты" : "минут";
    return `${n} ${w} чтения`;
  };

  // ---------- data ----------
  let INDEX = null, PEOPLE = null;
  async function loadAll() {
    if (!INDEX) {
      const [a, b] = await Promise.all([
        fetch("symposium/index.json", { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error("sym-index"); return r.json(); }),
        fetch("assets/thinkers/thinkers.json", { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error("thinkers"); return r.json(); }),
      ]);
      INDEX = (a.issues || []).slice().sort((x, y) => x.n - y.n);
      PEOPLE = b.thinkers || {};
    }
    return { issues: INDEX, people: PEOPLE };
  }
  const person = (id) => PEOPLE[id] || { name: id, short: id, years: "" };

  // ---------- votes (only in this browser) ----------
  const VKEY = "symposium:votes";
  const readVotes = () => { try { return JSON.parse(localStorage.getItem(VKEY) || "{}") || {}; } catch { return {}; } };
  const writeVotes = (v) => { try { localStorage.setItem(VKEY, JSON.stringify(v)); } catch { /* private mode */ } };
  const RKEY = "symposium:read";
  const readSeen = () => { try { return JSON.parse(localStorage.getItem(RKEY) || "[]") || []; } catch { return []; } };
  const markSeen = (slug) => { const s = new Set(readSeen()); s.add(slug); try { localStorage.setItem(RKEY, JSON.stringify([...s])); } catch { /* */ } };

  // ---------- portraits ----------
  function face(id, cls = "") {
    const p = person(id);
    const initials = p.short.split(/[\s-]+/).map((w) => w[0]).join("").slice(0, 2);
    return p.img
      ? `<span class="face ${cls}"><img src="${esc(p.img)}" alt="" loading="lazy"></span>`
      : `<span class="face mono ${cls}" aria-hidden="true">${esc(initials)}</span>`;
  }

  function parseFrontMatter(text) {
    const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
    if (!m) return { meta: {}, body: text };
    const meta = {};
    m[1].split("\n").forEach((line) => {
      const i = line.indexOf(":");
      if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    });
    return { meta, body: text.slice(m[0].length) };
  }

  // ---------- custom markdown blocks ----------
  // ```table  — JSON { axis: [левый полюс, правый полюс], seats: [{id, x, stance, work}] }
  // ```dialogue — строки «id: реплика»
  // ```vote — текст вопроса для голосования (варианты берутся из ```table)
  // ```think — как в основных выпусках
  function renderBlocks(body, ctx) {
    const blocks = [];
    const md = body.replace(/```(table|dialogue|vote|think)\n([\s\S]*?)```/g, (_, kind, code) => {
      blocks.push({ kind, code: code.trim() });
      return `\n\n<div data-block="${blocks.length - 1}"></div>\n\n`;
    });
    let html = marked.parse(md);
    html = html.replace(/<div data-block="(\d+)"><\/div>/g, (_, i) => {
      const b = blocks[Number(i)];
      try {
        if (b.kind === "table") return tableHTML(JSON.parse(b.code), ctx);
        if (b.kind === "dialogue") return dialogueHTML(b.code);
        if (b.kind === "vote") return voteHTML(b.code, ctx);
        if (b.kind === "think") return `<aside class="think"><b>Подумай сам</b>${marked.parse(b.code)}</aside>`;
      } catch (e) { console.error(e); }
      return "";
    });
    return html;
  }

  function tableHTML(t, ctx) {
    ctx.seats = t.seats || [];
    ctx.axis = t.axis || ["", ""];
    const n = ctx.seats.length;
    const seats = ctx.seats.map((s, i) => {
      // seats go around an ellipse, starting at the top, clockwise
      const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
      const x = 50 + 41 * Math.cos(a), y = 50 + 39 * Math.sin(a);
      const p = person(s.id);
      return `<button type="button" class="seat" data-id="${esc(s.id)}" style="left:${x.toFixed(2)}%;top:${y.toFixed(2)}%" aria-label="${esc(p.name)}: ${esc(s.stance)}">
        ${face(s.id)}<span class="seat-name">${esc(p.short)}</span></button>`;
    }).join("");
    const cards = ctx.seats.map((s) => {
      const p = person(s.id);
      return `<li class="guest" id="g-${esc(s.id)}" data-id="${esc(s.id)}">
        ${face(s.id, "lg")}
        <div><p class="guest-name">${esc(p.name)} <span>${esc(p.years)}</span></p>
        <p class="guest-stance">${esc(s.stance)}</p>
        ${s.work ? `<p class="guest-work">${esc(s.work)}</p>` : ""}</div>
      </li>`;
    }).join("");
    // place portraits on the axis; neighbours that would overlap go to the next row
    const placed = ctx.seats
      .map((s) => ({ id: s.id, x: Math.max(0, Math.min(100, (Number(s.x) + 1) * 50)) }))
      .sort((a, b) => a.x - b.x);
    const rowEnd = [];
    placed.forEach((d) => {
      let r = rowEnd.findIndex((end) => d.x - end >= 11);
      if (r < 0) { r = rowEnd.length; rowEnd.push(-100); }
      rowEnd[r] = d.x; d.row = r;
    });
    const rows = Math.max(1, rowEnd.length);
    const dots = placed.map((d) => `<span class="dot" data-id="${esc(d.id)}" style="left:${d.x.toFixed(1)}%;--row:${d.row}" title="${esc(person(d.id).name)}">${face(d.id, "sm")}<span class="dot-name">${esc(person(d.id).short)}</span></span>`).join("");
    return `<section class="table-block" aria-label="Кто за столом">
      <h2 class="sym-label">За столом</h2>
      <div class="round" style="--n:${n}">
        <div class="round-top"><span class="round-ask">${esc(ctx.ask || "")}</span></div>
        ${seats}
      </div>
      <ol class="guests">${cards}</ol>
      <div class="axis" aria-label="Где кто стоит">
        <h2 class="sym-label">Кто где стоит</h2>
        <div class="axis-line" style="--rows:${rows}">${dots}</div>
        <div class="axis-poles"><span>${esc(ctx.axis[0])}</span><span>${esc(ctx.axis[1])}</span></div>
      </div>
    </section>`;
  }

  function dialogueHTML(code) {
    const order = [];
    const lines = code.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
      const i = l.indexOf(":");
      const id = l.slice(0, i).trim(), text = l.slice(i + 1).trim();
      if (!order.includes(id)) order.push(id);
      return { id, text };
    });
    const items = lines.map(({ id, text }) => {
      const side = order.indexOf(id) % 2 ? "r" : "l";
      return `<li class="line ${side}">${face(id, "sm")}<div class="bubble"><b>${esc(person(id).short)}</b>${marked.parseInline(esc(text))}</div></li>`;
    }).join("");
    return `<section class="dialogue">
      <h2 class="sym-label">Спор, которого не было</h2>
      <p class="dialogue-note">Этих людей никогда не сажали за один стол. Реплики — пересказ их идей, а не цитаты.</p>
      <ol class="lines">${items}</ol>
    </section>`;
  }

  function voteHTML(code, ctx) {
    const opts = ctx.seats.map((s) => `<button type="button" class="vote-opt" data-id="${esc(s.id)}">${face(s.id, "sm")}<span>${esc(person(s.id).short)}</span></button>`).join("");
    return `<section class="vote" data-slug="${esc(ctx.slug)}">
      <h2 class="sym-label">Твой голос</h2>
      <p class="vote-q">${esc(code || "С кем ты согласен больше всего?")}</p>
      <div class="vote-opts">${opts}</div>
      <p class="vote-res" aria-live="polite"></p>
    </section>`;
  }

  function wire(root, ctx) {
    // round table → highlight the guest card
    const focusGuest = (id) => {
      root.querySelectorAll(".seat, .guest, .dot").forEach((el) => el.classList.toggle("on", el.dataset.id === id));
    };
    root.querySelectorAll(".seat").forEach((b) => b.addEventListener("click", () => {
      focusGuest(b.dataset.id);
      const card = root.querySelector(`#g-${CSS.escape(b.dataset.id)}`);
      if (card) card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }));
    root.querySelectorAll(".guest, .dot").forEach((g) => {
      g.addEventListener("mouseenter", () => focusGuest(g.dataset.id));
    });

    // vote
    const v = root.querySelector(".vote");
    if (v) {
      const res = v.querySelector(".vote-res");
      const show = () => {
        const id = readVotes()[ctx.slug];
        v.querySelectorAll(".vote-opt").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.id === id)));
        res.innerHTML = id
          ? `Ты на стороне: <b>${esc(person(id).name)}</b>. Голос хранится только в этом браузере, его можно поменять. Сводка — на <a href="#/symposium">главной «Симпозиума»</a>.`
          : "";
      };
      v.querySelectorAll(".vote-opt").forEach((b) => b.addEventListener("click", () => {
        const all = readVotes(); all[ctx.slug] = b.dataset.id; writeVotes(all); show();
      }));
      show();
    }
  }

  // ---------- views ----------
  function profileHTML(issues) {
    const votes = readVotes();
    const known = new Set(issues.map((i) => i.slug));
    const tally = {};
    Object.entries(votes).forEach(([slug, id]) => { if (known.has(slug)) tally[id] = (tally[id] || 0) + 1; });
    const ranked = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    const total = ranked.reduce((s, [, c]) => s + c, 0);
    if (!total) {
      return `<aside class="profile empty-profile"><h2 class="sym-label">Твоя философия</h2>
        <p>В конце каждого выпуска можно встать на сторону одного из философов. Здесь соберётся твой портрет: с кем ты соглашаешься чаще всего.</p></aside>`;
    }
    const [topId, topN] = ranked[0];
    const rows = ranked.map(([id, c]) => `<li>${face(id, "sm")}<span class="pn">${esc(person(id).short)}</span>
      <span class="bar"><i style="width:${(100 * c / topN).toFixed(0)}%"></i></span><span class="pc">${c}</span></li>`).join("");
    return `<aside class="profile"><h2 class="sym-label">Твоя философия</h2>
      <p>Проголосовано в ${total} из ${issues.length}. Чаще всего ты на стороне — <b>${esc(person(topId).name)}</b>.</p>
      <ol class="tally">${rows}</ol></aside>`;
  }

  async function index(app) {
    const { issues } = await loadAll();
    const seen = new Set(readSeen());
    const cards = issues.map((it) => {
      const faces = (it.thinkers || []).slice(0, 6).map((id) => face(id, "sm")).join("");
      return `<li class="plate ${seen.has(it.slug) ? "seen" : ""}" data-domain="philo">
        <a href="#/s/${encodeURIComponent(it.slug)}">
          <span class="plate-n">${ROMAN(it.n)}</span>
          <span class="plate-t">${esc(it.title)}</span>
          <span class="plate-faces">${faces}</span>
          <span class="plate-meta">${(it.thinkers || []).length} за столом · ${esc(minutes(Number(it.reading) || 10))}${seen.has(it.slug) ? " · прочитано" : ""}</span>
        </a></li>`;
    }).join("");
    app.innerHTML = `<div data-domain="philo">
      <section class="sym-hero">
        <p class="sym-kicker">Раздел о философии</p>
        <h1>Симпозиум</h1>
        <p class="sym-lede">У древних греков симпосий — это пир, где после ужина спорили о любви, власти и смерти. Здесь то же самое: один большой вопрос, пять-восемь философов из разных веков за одним столом, и спор, которого никогда не было. ${plural(issues.length, "вопрос", "вопроса", "вопросов")} — читай в любом порядке.</p>
      </section>
      <div class="wrap sym-grid">
        <ol class="plates">${cards}</ol>
        ${profileHTML(issues)}
      </div>
    </div>`;
    document.title = "Симпозиум · Апория";
  }

  async function issue(app, slug) {
    const { issues } = await loadAll();
    const i = issues.findIndex((x) => x.slug === slug);
    const r = await fetch(`symposium/${encodeURIComponent(slug)}.md`, { cache: "no-cache" });
    if (!r.ok || i < 0) {
      app.innerHTML = `<div class="about"><h1>Такого выпуска нет</h1><p><a href="#/symposium">Все вопросы «Симпозиума»</a></p></div>`;
      return;
    }
    const { meta, body } = parseFrontMatter(await r.text());
    const it = Object.assign({}, issues[i], meta);
    const ctx = { slug, ask: it.ask, seats: [] };
    const prose = renderBlocks(body, ctx);
    const prev = issues[i - 1], next = issues[i + 1];
    const used = [...new Set(ctx.seats.map((s) => s.id))].filter((id) => person(id).credit);
    const credits = used.map((id) => {
      const p = person(id), c = p.credit;
      return `<li>${esc(p.short)} — ${esc(c.author)}, <a href="${esc(c.url)}" rel="noopener">${esc(c.license)}</a></li>`;
    }).join("");

    app.innerHTML = `<article class="sym" data-domain="philo">
      <header class="sym-head">
        <p class="sym-kicker"><a href="#/symposium">Симпозиум</a> · вопрос ${ROMAN(it.n)} · ${esc(minutes(Number(it.reading) || 10))}</p>
        <span class="sym-num" aria-hidden="true">${ROMAN(it.n)}</span>
        <h1>${esc(it.title)}</h1>
      </header>
      <div class="article-body">
        ${it.short ? `<div class="short"><b>Если коротко</b><p>${esc(it.short)}</p></div>` : ""}
        <div class="prose sym-prose">${prose}</div>
        ${credits ? `<details class="credits"><summary>Откуда портреты</summary><ul>${credits}</ul><p>Все изображения — с Wikimedia Commons.</p></details>` : ""}
      </div>
      <nav class="article-nav" aria-label="Соседние вопросы">
        ${prev ? `<a href="#/s/${encodeURIComponent(prev.slug)}"><small>Вопрос ${ROMAN(prev.n)}</small><span>${esc(prev.title)}</span></a>` : "<span></span>"}
        ${next ? `<a class="next" href="#/s/${encodeURIComponent(next.slug)}"><small>Вопрос ${ROMAN(next.n)}</small><span>${esc(next.title)}</span></a>` : ""}
      </nav>
    </article>`;
    wire(app, ctx);
    markSeen(slug);
    document.title = `${it.title} · Симпозиум`;
  }

  window.Symposium = { index, issue };
})();
