(() => {
  "use strict";

  const DOMAINS = {
    bio:        { name: "Тело и жизнь",        day: 1 },
    society:    { name: "Общество и мораль",   day: 2 },
    physics:    { name: "Физика и космос",     day: 3 },
    aesthetics: { name: "Стиль и эстетика",    day: 4 },
    sport:      { name: "Спорт и возможности", day: 5 },
    history:    { name: "История вещей",       day: 6 },
    wild:       { name: "Что угодно",          day: 0 },
  };
  const WEEK = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const WEEK_ORDER = ["bio", "society", "physics", "aesthetics", "sport", "history", "wild"];

  const app = document.getElementById("app");
  let INDEX = null;
  let filter = null;

  // ---------- helpers ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
  const parseDate = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const fmtDay = (s) => new Intl.DateTimeFormat("ru", { day: "numeric", month: "long" }).format(parseDate(s));
  const fmtShort = (s) => new Intl.DateTimeFormat("ru", { day: "numeric", month: "short" }).format(parseDate(s)).replace(".", "");
  const fmtMonth = (s) => {
    const t = new Intl.DateTimeFormat("ru", { month: "long", year: "numeric" }).format(parseDate(s));
    return t.charAt(0).toUpperCase() + t.slice(1);
  };
  const domainName = (d) => (DOMAINS[d] || DOMAINS.wild).name;
  const tag = (d, href) => href
    ? `<a class="domain-tag" data-domain="${esc(d)}" href="${href}">${esc(domainName(d))}</a>`
    : `<span class="domain-tag" data-domain="${esc(d)}">${esc(domainName(d))}</span>`;
  const titleHTML = (t) => {
    const s = esc(t);
    return s.endsWith("?") ? s.slice(0, -1) + '<span class="q">?</span>' : s;
  };
  const minutes = (n) => {
    const m = n % 10, h = n % 100;
    const w = (m === 1 && h !== 11) ? "минута" : (m >= 2 && m <= 4 && (h < 12 || h > 14)) ? "минуты" : "минут";
    return `${n} ${w} чтения`;
  };

  async function loadIndex() {
    if (INDEX) return INDEX;
    const r = await fetch("posts/index.json", { cache: "no-cache" });
    if (!r.ok) throw new Error("index");
    const data = await r.json();
    INDEX = (data.posts || []).slice().sort((a, b) => (b.date + b.slug).localeCompare(a.date + a.slug));
    return INDEX;
  }

  function parseFrontMatter(text) {
    const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
    if (!m) return { meta: {}, body: text };
    const meta = {};
    m[1].split("\n").forEach((line) => {
      const i = line.indexOf(":");
      if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    });
    return { meta, body: text.slice(m[0].length) };
  }

  // ---------- markdown with custom blocks ----------
  let quizCount = 0;
  marked.use({
    renderer: {
      code(code, lang) {
        // marked v12 passes (code, infostring); v13+ passes a token object
        if (typeof code === "object") { lang = code.lang; code = code.text; }
        lang = (lang || "").trim();
        if (lang === "think") {
          return `<aside class="think"><b>Подумай сам</b>${marked.parse(code)}</aside>`;
        }
        if (lang === "quiz") {
          let qs;
          try { qs = JSON.parse(code); } catch { return ""; }
          const id = ++quizCount;
          const items = qs.map((q, qi) => `
            <div class="quiz-q" data-answer="${Number(q.answer)}">
              <p>${esc(q.q)}</p>
              <div class="quiz-opts">
                ${q.options.map((o, oi) => `<button type="button" class="quiz-opt" data-i="${oi}">${esc(o)}</button>`).join("")}
              </div>
              <p class="quiz-why" hidden>${esc(q.why || "")}</p>
            </div>`).join("");
          return `<section class="quiz" id="quiz-${id}"><h2>Проверь себя</h2>${items}</section>`;
        }
        return false;
      },
    },
  });

  function wireQuizzes(root) {
    root.querySelectorAll(".quiz-q").forEach((q) => {
      const answer = Number(q.dataset.answer);
      const why = q.querySelector(".quiz-why");
      q.querySelectorAll(".quiz-opt").forEach((btn) => {
        btn.addEventListener("click", () => {
          const i = Number(btn.dataset.i);
          q.querySelectorAll(".quiz-opt").forEach((b) => {
            b.disabled = true;
            if (Number(b.dataset.i) === answer) b.classList.add("right");
          });
          if (i !== answer) btn.classList.add("wrong");
          why.innerHTML = `<b>${i === answer ? "Верно." : "Не совсем."}</b> ` + why.innerHTML;
          why.hidden = false;
        });
      });
    });
  }

  // ---------- views ----------
  function weekHTML() {
    const today = new Date().getDay();
    const items = WEEK_ORDER.map((d, i) => {
      const isToday = DOMAINS[d].day === today;
      return `<li data-domain="${d}" class="${isToday ? "today" : ""}">
        <span class="wd">${WEEK[i]}${isToday ? ", сегодня" : ""}</span>
        <span class="dn">${esc(DOMAINS[d].name)}</span>
      </li>`;
    }).join("");
    return `<section class="wrap week" aria-labelledby="week-t">
      <h2 class="section-title" id="week-t">Какая тема в какой день</h2>
      <ul class="week-grid">${items}</ul>
    </section>`;
  }

  function listHTML(posts) {
    const shown = filter ? posts.filter((p) => p.domain === filter) : posts;
    if (!shown.length) return `<p class="empty">В этой теме пока ничего нет. Первый выпуск появится в её день недели.</p>`;
    let html = "", month = "";
    shown.forEach((p) => {
      const m = fmtMonth(p.date);
      if (m !== month) { if (month) html += "</ul>"; html += `<h3 class="month">${esc(m)}</h3><ul class="entries">`; month = m; }
      html += `<li class="entry" data-domain="${esc(p.domain)}"><a href="#/p/${encodeURIComponent(p.slug)}">
        <span class="date">${esc(fmtShort(p.date))}</span>
        <span>${tag(p.domain)}<span class="t">${esc(p.title)}</span><span class="s">${esc(p.short)}</span></span>
      </a></li>`;
    });
    return html + "</ul>";
  }

  function archiveHTML(posts, withTitle = true) {
    const chips = [`<button type="button" class="chip" aria-pressed="${!filter}" data-f="">Все темы</button>`]
      .concat(WEEK_ORDER.map((d) => `<button type="button" class="chip" data-domain="${d}" data-f="${d}" aria-pressed="${filter === d}">${esc(DOMAINS[d].name)}</button>`))
      .join("");
    return `<section class="wrap archive" aria-labelledby="arch-t">
      <div class="archive-head"><h2 class="section-title" id="arch-t">${withTitle ? "Все вопросы" : "Архив"}</h2>
      <span class="empty">${posts.length} ${posts.length === 1 ? "выпуск" : (posts.length % 10 >= 2 && posts.length % 10 <= 4 && (posts.length % 100 < 12 || posts.length % 100 > 14)) ? "выпуска" : "выпусков"}</span></div>
      <div class="filters" role="group" aria-label="Фильтр по темам">${chips}</div>
      <div id="list">${listHTML(posts)}</div>
    </section>`;
  }

  function wireFilters(posts) {
    app.querySelectorAll(".chip").forEach((c) => c.addEventListener("click", () => {
      filter = c.dataset.f || null;
      app.querySelectorAll(".chip").forEach((x) => x.setAttribute("aria-pressed", String((x.dataset.f || null) === filter)));
      app.querySelector("#list").innerHTML = listHTML(posts);
    }));
  }

  async function viewHome() {
    const posts = await loadIndex();
    const p = posts[0];
    const hero = p ? `<section class="hero" data-domain="${esc(p.domain)}">
        <div class="hero-mark" aria-hidden="true">?</div>
        <p class="hero-meta">${tag(p.domain)}<span>${esc(fmtDay(p.date))}</span><span>${esc(minutes(Number(p.reading) || 7))}</span></p>
        <h1>${esc(p.title)}</h1>
        <p class="hero-short">${esc(p.short)}</p>
        <a class="btn" href="#/p/${encodeURIComponent(p.slug)}">Читать разбор</a>
      </section>`
      : `<section class="hero"><div class="hero-mark" aria-hidden="true">?</div><h1>Первый вопрос появится завтра утром</h1></section>`;
    app.innerHTML = hero + weekHTML() + archiveHTML(posts.slice(1).length ? posts : posts, true);
    wireFilters(posts);
    document.title = "Почемучка";
  }

  async function viewArchive() {
    const posts = await loadIndex();
    app.innerHTML = `<div style="height:1rem"></div>` + archiveHTML(posts, true);
    wireFilters(posts);
    document.title = "Архив · Почемучка";
  }

  async function viewPost(slug) {
    const posts = await loadIndex();
    const i = posts.findIndex((p) => p.slug === slug);
    const r = await fetch(`posts/${encodeURIComponent(slug)}.md`, { cache: "no-cache" });
    if (!r.ok) { app.innerHTML = `<div class="about"><h1>Такого выпуска нет</h1><p>Возможно, ссылка устарела. <a href="#/archive">Открыть архив</a></p></div>`; return; }
    const { meta, body } = parseFrontMatter(await r.text());
    const p = Object.assign({}, posts[i] || {}, meta);
    const d = p.domain || "wild";
    const newer = i > 0 ? posts[i - 1] : null;
    const older = i >= 0 && i < posts.length - 1 ? posts[i + 1] : null;

    app.innerHTML = `<article data-domain="${esc(d)}">
      <header class="article-head">
        <p class="hero-meta">${tag(d)}${p.date ? `<span>${esc(fmtDay(p.date))}</span>` : ""}<span>${esc(minutes(Number(p.reading) || 7))}</span></p>
        <h1>${titleHTML(p.title || "")}</h1>
      </header>
      <div class="article-body">
        ${p.short ? `<div class="short"><b>Если коротко</b><p>${esc(p.short)}</p></div>` : ""}
        <div class="prose">${marked.parse(body)}</div>
      </div>
      <nav class="article-nav" aria-label="Соседние выпуски">
        ${older ? `<a href="#/p/${encodeURIComponent(older.slug)}" data-domain="${esc(older.domain)}"><small>Предыдущий</small><span>${esc(older.title)}</span></a>` : "<span></span>"}
        ${newer ? `<a class="next" href="#/p/${encodeURIComponent(newer.slug)}" data-domain="${esc(newer.domain)}"><small>Следующий</small><span>${esc(newer.title)}</span></a>` : ""}
      </nav>
    </article>`;
    wireQuizzes(app);
    document.title = `${p.title} · Почемучка`;
  }

  function viewAbout() {
    app.innerHTML = `<div class="about prose">
      <h1>Как это устроено</h1>
      <p>Каждое утро здесь появляется один большой вопрос: откуда мораль, как растут волосы, почему небо синее. Ответ на него объяснён просто, но подробно.</p>
      <h2>Из чего состоит выпуск</h2>
      <ul>
        <li><strong>Крючок.</strong> Странный факт или парадокс, с которого всё начинается.</li>
        <li><strong>Если коротко.</strong> Ответ в двух предложениях.</li>
        <li><strong>Разбор.</strong> Как это устроено на самом деле, с примерами и аналогиями.</li>
        <li><strong>Где учёные спорят.</strong> Что пока не известно наверняка.</li>
        <li><strong>Неожиданная связь.</strong> Как тема пересекается с совсем другой областью.</li>
        <li><strong>Проверь себя и подумай сам.</strong> Пара вопросов и одна задача без ответа.</li>
      </ul>
      <h2>Темы по дням</h2>
      <p>Понедельник — тело и жизнь, вторник — общество и мораль, среда — физика и космос, четверг — стиль и эстетика, пятница — спорт и возможности, суббота — история вещей, воскресенье — что угодно.</p>
      <h2>Свой вопрос</h2>
      <p>Чтобы предложить вопрос, допиши его в файл <code>queue.md</code> в репозитории сайта. Он попадёт в один из ближайших выпусков.</p>
    </div>`;
    document.title = "Как это устроено · Почемучка";
  }

  // ---------- router ----------
  async function route() {
    const h = location.hash.replace(/^#\/?/, "");
    document.querySelectorAll(".site-nav a").forEach((a) => {
      const target = a.getAttribute("href").replace(/^#\/?/, "");
      a.toggleAttribute("aria-current", target === h || (target === "" && h === ""));
      if (a.hasAttribute("aria-current")) a.setAttribute("aria-current", "page");
    });
    try {
      if (h.startsWith("p/")) await viewPost(decodeURIComponent(h.slice(2)));
      else if (h === "archive") await viewArchive();
      else if (h === "about") viewAbout();
      else await viewHome();
    } catch (e) {
      app.innerHTML = `<div class="about"><h1>Не получилось загрузить выпуски</h1><p>Проверь подключение к интернету и обнови страницу.</p></div>`;
      console.error(e);
    }
    window.scrollTo(0, 0);
    if (h) app.focus({ preventScroll: true });
  }

  window.addEventListener("hashchange", route);
  route();
})();
