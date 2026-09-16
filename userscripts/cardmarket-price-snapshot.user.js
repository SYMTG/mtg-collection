// ==UserScript==
// @name         Cardmarket price snapshot
// @namespace    symtg.mtg-collection
// @version      3.2.0
// @description  Manually save a snapshot (name, available items, price) of a Cardmarket sealed-product page into Supabase, matched to the site's sealed_products. Only runs when you click the button on a page you opened yourself — no background/scheduled requests.
// @match        https://www.cardmarket.com/*/Magic/Products/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      supabase.co
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  // Keep in sync with PRODUCT_TYPES / LANGUAGES in src/app/mtg/sealed/page.tsx.
  const PRODUCT_TYPES = [
    "Booster Box", "Booster Pack", "Draft Booster", "Set Booster", "Collector Booster",
    "Bundle", "Commander Deck", "Duel Deck", "Tournament Pack", "Prerelease Kit",
    "Buy-a-Box Promo", "Treasure Chest", "Other",
  ];
  const LANGUAGES = ["ENG", "RUS", "FRA", "ITA", "GER", "JPN", "Other"];

  // Best-effort guess from Cardmarket's category subtitle ("Booster Boxes"
  // under the h1) to one of PRODUCT_TYPES above — always editable, so a
  // wrong or missing guess is harmless.
  const CATEGORY_TO_TYPE = {
    "booster boxes": "Booster Box",
    "play booster boxes": "Booster Box",
    "boosters": "Booster Pack",
    "booster packs": "Booster Pack",
    "play boosters": "Booster Pack",
    "draft boosters": "Draft Booster",
    "set boosters": "Set Booster",
    "collector boosters": "Collector Booster",
    "bundles": "Bundle",
    "commander decks": "Commander Deck",
    "duel decks": "Duel Deck",
    "tournament packs": "Tournament Pack",
    "prerelease kits": "Prerelease Kit",
  };

  // Set-name prefix -> code, for the ~40 products already tracked (pulled
  // from scripts/import-sealed2-boxes.mjs / import-sealed2-other.mjs). Only
  // used to PRE-FILL the Set code field — always editable, so a miss or a
  // wrong guess costs one keystroke, not a bad save. Checked longest-first
  // so a more specific name wins (matters for e.g. "dominaria" also being
  // a prefix of a hypothetical "Dominaria United" this list doesn't have
  // yet — if that's ever added, give it its own longer-prefix entry).
  const KNOWN_SETS = {
    "mercadian masques": "mmq",
    "ninth edition": "9ed",
    "return to ravnica": "rtr",
    "journey into nyx": "jou",
    "khans of tarkir": "ktk",
    "fate reforged": "frf",
    "dragons of tarkir": "dtk",
    "magic origins": "ori",
    "battle for zendikar": "bfz",
    "shadows over innistrad": "soi",
    "eternal masters": "ema",
    "eldritch moon": "emn",
    "aether revolt": "aer",
    "hour of devastation": "hou",
    "ixalan": "xln",
    "rivals of ixalan": "rix",
    "dominaria": "dom",
    "guilds of ravnica": "grn",
    "ravnica allegiance": "rna",
    "theros beyond death": "thb",
    "ikoria": "iko",
    "core set 2021": "m21",
    "zendikar rising": "znr",
    "kaldheim": "khm",
    "strixhaven": "stx",
    "adventures in the forgotten realms": "afr",
    "innistrad: midnight hunt": "mid",
    "innistrad: crimson vow": "vow",
    "streets of new capenna": "snc",
    "double masters 2022": "2x2",
    "phyrexia: all will be one": "one",
    "aetherdrift": "dft",
    "tarkir: dragonstorm": "tdm",
    "secrets of strixhaven": "sos",
    "marvel's spider-man": "spm",
    "spider-man": "spm",
    "spider man": "spm",
    "urza's saga": "usg",
    "commander 2015": "c15",
    "duel decks: elspeth vs. kiora": "ddo",
  };
  const KNOWN_SET_KEYS = Object.keys(KNOWN_SETS).sort((a, b) => b.length - a.length);

  function guessSetCode(productName) {
    const name = productName.toLowerCase();
    const key = KNOWN_SET_KEYS.find((k) => name.startsWith(k));
    return key ? KNOWN_SETS[key] : "";
  }

  // ---- Supabase credentials (stored locally by Tampermonkey, never in this file) ----

  function ensureConfig() {
    let url = GM_getValue("cm_supabase_url", "");
    let key = GM_getValue("cm_supabase_key", "");
    if (!url || !key) {
      url = prompt("Supabase project URL (NEXT_PUBLIC_SUPABASE_URL):", url) || "";
      if (!url.trim()) return false;
      key = prompt("Supabase anon/publishable key (NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY):", key) || "";
      if (!key.trim()) return false;
      GM_setValue("cm_supabase_url", url.trim().replace(/\/+$/, ""));
      GM_setValue("cm_supabase_key", key.trim());
    }
    return true;
  }

  GM_registerMenuCommand("Reset Supabase credentials", () => {
    GM_setValue("cm_supabase_url", "");
    GM_setValue("cm_supabase_key", "");
    alert("Cleared — you'll be asked again next time you save a snapshot.");
  });

  // ---- Parsing the already-rendered page ----

  function getProductName() {
    const h1 = document.querySelector("h1");
    if (!h1) return document.title.trim();
    // Only h1's own direct text, not a nested subtitle element (Cardmarket
    // renders the category, e.g. "Booster Boxes", inside the same h1).
    let text = "";
    for (const node of h1.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) text += node.textContent;
    }
    text = text.trim();
    return text || h1.textContent.trim();
  }

  function getProductCategory() {
    const h1 = document.querySelector("h1");
    if (!h1 || !h1.children.length) return "";
    return h1.children[0].textContent.trim();
  }

  function guessProductType() {
    const category = getProductCategory().toLowerCase();
    return CATEGORY_TO_TYPE[category] || "Other";
  }

  // Cardmarket's exact markup isn't verifiable from here (the page sits
  // behind Cloudflare, so it was never fetched to check class names) —
  // this looks for a leaf element whose text matches the label exactly,
  // then reads the next element as the value. If a field comes back
  // empty, fill it in by hand in the panel.
  function findLabelValue(label) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.children.length > 0) continue;
      if (node.textContent.trim() === label) {
        let sib = node.nextElementSibling;
        while (sib && sib.textContent.trim() === "") sib = sib.nextElementSibling;
        if (sib) return sib.textContent.trim();
      }
    }
    return "";
  }

  // "1.499,69 €" -> 1499.69 (European thousands "." / decimal ",")
  function parseMoney(str) {
    if (!str) return null;
    const cleaned = str
      .replace(/[^\d.,-]/g, "")
      .replace(/\.(?=\d{3}(\D|$))/g, "")
      .replace(",", ".");
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : null;
  }

  function parseCount(str) {
    if (!str) return null;
    const n = parseInt(str.replace(/[^\d]/g, ""), 10);
    return Number.isFinite(n) ? n : null;
  }

  function currentMonthStart() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  }

  // Confirmed against a saved copy of a real product page (Cloudflare
  // blocks live fetches, so this couldn't be checked any other way): each
  // offer is a `.article-row`; its language sits as plain text in
  // data-original-title/title on the one tagged icon inside
  // `.product-attributes` (e.g. "Spanish", "English", "T-Chinese" — that's
  // Cardmarket's own abbreviation for Traditional Chinese, not ours); the
  // desktop price lives in `.col-offer .price-container` (the same price
  // is duplicated in a `.mobile-offer-container` for narrow viewports —
  // reading only the desktop copy avoids double-counting).
  function scanOffers() {
    const rows = [...document.querySelectorAll(".article-row")];
    return rows
      .map((row) => {
        const langEl = row.querySelector(".product-attributes [data-original-title], .product-attributes [title]");
        const language = langEl ? (langEl.getAttribute("data-original-title") || langEl.getAttribute("title")).trim() : null;
        const priceEl = row.querySelector(".col-offer .price-container .color-primary");
        const price = priceEl ? parseMoney(priceEl.textContent) : null;
        const qtyEl = row.querySelector(".col-offer .amount-container .item-count");
        const quantity = qtyEl ? parseCount(qtyEl.textContent) : null;
        return { language, price, quantity };
      })
      .filter((o) => o.price != null);
  }

  // True when Cardmarket is hiding more offers behind "Show more results"
  // (#loadMoreButton is simply absent from the DOM when everything already
  // fits on the page — confirmed on both a small product with none and a
  // popular one with 1394 offers behind it, capped at loading 300 even if
  // you click through every page). When it's present, summing the loaded
  // rows would undercount — sometimes by a lot — so this falls back to
  // Cardmarket's own page-level stat instead, which is the only complete
  // count available in that case.
  function hasMoreOffers() {
    return !!document.getElementById("loadMoreButton");
  }

  // On a small listing (everything loaded, no "Show more") this is more
  // reliable than Cardmarket's own "Available items" stat — seen live: the
  // stat said 5 while the table actually had 8 rows.
  function totalAvailable(offers) {
    if (!offers.length) return null;
    return offers.reduce((sum, o) => sum + (o.quantity ?? 0), 0);
  }

  function cheapest(offers, predicate) {
    const matching = offers.filter(predicate).map((o) => o.price);
    return matching.length ? Math.min(...matching) : null;
  }

  // Your rule: an ENG copy compares against the cheapest English offer: a
  // copy in any other language (RUS included) compares against the
  // cheapest non-English offer.
  function cmMinForLanguage(offers, language) {
    return language === "ENG"
      ? cheapest(offers, (o) => o.language === "English")
      : cheapest(offers, (o) => o.language && o.language !== "English");
  }

  // Remembers the set/type/language match two ways: by the exact product
  // name text, and by the resolved set code. The name-keyed entry is more
  // precise; the code-keyed one survives Cardmarket renaming the product
  // under our feet (seen live: "Booster Box" -> "Play Booster Box", which
  // changed both the category guess and the exact name in one go) — once
  // you've confirmed a Product Type/Language for a set code, it sticks
  // regardless of what the product name looks like on a later visit.
  function getLearnedSets() {
    try {
      return JSON.parse(GM_getValue("cm_learned_sets", "{}"));
    } catch {
      return {};
    }
  }

  function getLearnedByCode() {
    try {
      return JSON.parse(GM_getValue("cm_learned_by_code", "{}"));
    } catch {
      return {};
    }
  }

  function saveLearnedSet(productName, match) {
    const byName = getLearnedSets();
    byName[productName.toLowerCase()] = match;
    GM_setValue("cm_learned_sets", JSON.stringify(byName));

    if (match.setCode) {
      const byCode = getLearnedByCode();
      byCode[match.setCode.toLowerCase().trim()] = { productType: match.productType, language: match.language };
      GM_setValue("cm_learned_by_code", JSON.stringify(byCode));
    }
  }

  GM_registerMenuCommand("Forget all learned set/type/language matches", () => {
    GM_setValue("cm_learned_sets", "{}");
    GM_setValue("cm_learned_by_code", "{}");
    alert("Cleared — every product will ask for its match again next time.");
  });

  function extractData() {
    const productName = getProductName();
    const byName = getLearnedSets()[productName.toLowerCase()] || {};
    const setCode = byName.setCode || guessSetCode(productName);
    const byCode = (setCode && getLearnedByCode()[setCode.toLowerCase()]) || {};
    const learned = {
      setCode,
      productType: byName.productType || byCode.productType,
      language: byName.language || byCode.language,
    };
    const offers = scanOffers();
    const language = learned.language || "ENG";
    const cmMin = cmMinForLanguage(offers, language);

    // Sum of the loaded offer rows on a fully-loaded page (more accurate
    // than Cardmarket's own stat there); Cardmarket's own page-level stat
    // when "Show more results" means the DOM doesn't have everything.
    const availableItems = hasMoreOffers()
      ? parseCount(findLabelValue("Available items"))
      : totalAvailable(offers) ?? parseCount(findLabelValue("Available items"));

    return {
      productName,
      availableItems,
      // Falls back to the page's own "From" stat (all languages mixed) only
      // if the offer table couldn't be read at all.
      priceFrom: cmMin ?? parseMoney(findLabelValue("From")),
      setCode: learned.setCode,
      productType: learned.productType || guessProductType(),
      language,
      offers,
    };
  }

  // ---- Supabase REST helper ----

  function restRequest({ method, path, query, prefer, body }) {
    const url = GM_getValue("cm_supabase_url");
    const key = GM_getValue("cm_supabase_key");
    const qs = query ? `?${query}` : "";
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method,
        url: `${url}${path}${qs}`,
        headers: {
          "Content-Type": "application/json",
          apikey: key,
          Authorization: `Bearer ${key}`,
          ...(prefer ? { Prefer: prefer } : {}),
        },
        data: body ? JSON.stringify(body) : undefined,
        onload: (res) => {
          if (res.status >= 200 && res.status < 300) {
            try {
              resolve(res.responseText ? JSON.parse(res.responseText) : null);
            } catch {
              resolve(null);
            }
          } else {
            reject(new Error(`HTTP ${res.status}: ${res.responseText.slice(0, 300)}`));
          }
        },
        onerror: () => reject(new Error("Network error")),
      });
    });
  }

  // Same upsert key as sealed_products elsewhere in the app (set_code,
  // product_type, language) — reuses the row if it already exists.
  async function upsertSealedProduct({ setCode, productType, language }) {
    const rows = await restRequest({
      method: "POST",
      path: "/rest/v1/sealed_products",
      query: "on_conflict=set_code,product_type,language",
      prefer: "resolution=merge-duplicates,return=representation",
      body: [{ set_code: setCode.toLowerCase().trim(), product_type: productType, language }],
    });
    if (!rows || !rows[0]) throw new Error("sealed_products upsert returned no row");
    return rows[0].id;
  }

  // Upsert on (product_id, snapshot_month): a second save in the same
  // calendar month overwrites this product's row instead of adding one.
  async function upsertSnapshot(productId, data) {
    await restRequest({
      method: "POST",
      path: "/rest/v1/cardmarket_price_snapshots",
      query: "on_conflict=product_id,snapshot_month",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: [{
        product_id: productId,
        product_name: data.productName,
        product_url: location.href,
        available_items: data.availableItems,
        price_from: data.priceFrom,
        collected_at: new Date().toISOString(),
        snapshot_month: currentMonthStart(),
      }],
    });
  }

  // ---- UI ----

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function toIntOrNull(v) {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  }

  function toFloatOrNull(v) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }

  let triggerBtn = null;

  function showOverlay(parsed) {
    if (triggerBtn) triggerBtn.style.display = "none";

    const host = document.createElement("div");
    host.style.cssText = "position:fixed;bottom:16px;right:16px;z-index:2147483647;";
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });

    const typeOptions = PRODUCT_TYPES.map(
      (t) => `<option value="${t}" ${t === parsed.productType ? "selected" : ""}>${t}</option>`
    ).join("");
    const langOptions = LANGUAGES.map(
      (l) => `<option value="${l}" ${l === parsed.language ? "selected" : ""}>${l}</option>`
    ).join("");

    const cheapestEnglish = cheapest(parsed.offers, (o) => o.language === "English");
    const cheapestNonEnglish = cheapest(parsed.offers, (o) => o.language && o.language !== "English");
    const moreHidden = hasMoreOffers();
    const hint = parsed.offers.length
      ? `${parsed.offers.length} offer(s) read — cheapest English ${cheapestEnglish != null ? cheapestEnglish.toFixed(2) + " €" : "—"}, cheapest non-English ${cheapestNonEnglish != null ? cheapestNonEnglish.toFixed(2) + " €" : "—"}` +
        (moreHidden ? " — more offers hidden behind \"Show more results\", Available items uses the page's own stat" : "")
      : "No offer rows read — From falls back to the page's own mixed-language figure.";

    shadow.innerHTML = `
      <style>
        .panel { font: 13px/1.4 system-ui, sans-serif; background:#1c1c1f; color:#f2f2f2;
                 border:1px solid #3a3a3f; border-radius:8px; padding:14px; width:300px;
                 box-shadow:0 4px 20px rgba(0,0,0,.4); max-height:90vh; overflow:auto; }
        .panel h3 { margin:0 0 10px; font-size:13px; font-weight:600; }
        .row { margin-bottom:8px; display:flex; flex-direction:column; gap:2px; }
        .two-col { display:flex; gap:8px; }
        .two-col .row { flex:1; }
        label { font-size:11px; color:#a1a1aa; text-transform:uppercase; letter-spacing:.03em; }
        input, select { background:#0f0f11; border:1px solid #3a3a3f; color:#f2f2f2; border-radius:4px;
                padding:5px 7px; font-size:13px; }
        hr { border:none; border-top:1px solid #3a3a3f; margin:10px 0; }
        .hint { font-size:11px; color:#71717a; margin:-4px 0 10px; line-height:1.4; }
        .actions { display:flex; gap:8px; margin-top:10px; }
        button { flex:1; border:none; border-radius:4px; padding:7px; font-size:13px; cursor:pointer; }
        .save { background:#6366f1; color:white; font-weight:600; }
        .cancel { background:#3a3a3f; color:#f2f2f2; }
        .status { margin-top:8px; font-size:12px; min-height:16px; }
      </style>
      <div class="panel">
        <h3>Save Cardmarket snapshot</h3>
        <div class="row"><label>Product</label><input id="f-name" value="${escapeHtml(parsed.productName)}"></div>
        <div class="two-col">
          <div class="row"><label>Available items</label><input id="f-avail" type="number" value="${parsed.availableItems ?? ""}"></div>
          <div class="row"><label>From (EUR)</label><input id="f-from" type="number" step="0.01" value="${parsed.priceFrom ?? ""}"></div>
        </div>
        <p class="hint" id="offer-hint">${hint}</p>
        <hr>
        <div class="row"><label>Match to sealed_products — set code</label><input id="f-set" placeholder="e.g. mmq" value="${escapeHtml(parsed.setCode)}"></div>
        <div class="two-col">
          <div class="row"><label>Product type</label><select id="f-type">${typeOptions}</select></div>
          <div class="row"><label>Language</label><select id="f-lang">${langOptions}</select></div>
        </div>
        <div class="actions">
          <button class="cancel" id="btn-cancel">Cancel</button>
          <button class="save" id="btn-save">Save</button>
        </div>
        <div class="status" id="status"></div>
      </div>
    `;

    function close() {
      host.remove();
      if (triggerBtn) triggerBtn.style.display = "";
    }

    // Re-applies the RUS/ENG -> non-English/English rule if you change the
    // language dropdown before saving, instead of leaving the pre-filled
    // From value stuck on whatever language it first guessed.
    shadow.getElementById("f-lang").onchange = (e) => {
      const recomputed = cmMinForLanguage(parsed.offers, e.target.value);
      if (recomputed != null) shadow.getElementById("f-from").value = recomputed.toFixed(2);
    };

    shadow.getElementById("btn-cancel").onclick = close;
    shadow.getElementById("btn-save").onclick = async () => {
      const statusEl = shadow.getElementById("status");
      const setCode = shadow.getElementById("f-set").value.trim();
      const data = {
        productName: shadow.getElementById("f-name").value.trim(),
        availableItems: toIntOrNull(shadow.getElementById("f-avail").value),
        priceFrom: toFloatOrNull(shadow.getElementById("f-from").value),
      };
      const productType = shadow.getElementById("f-type").value;
      const language = shadow.getElementById("f-lang").value;

      if (!data.productName) {
        statusEl.style.color = "#f87171";
        statusEl.textContent = "Product name is required.";
        return;
      }
      if (!setCode) {
        statusEl.style.color = "#f87171";
        statusEl.textContent = "Set code is required to match sealed_products.";
        return;
      }

      statusEl.style.color = "#a1a1aa";
      statusEl.textContent = "Matching product...";
      try {
        const productId = await upsertSealedProduct({ setCode, productType, language });
        saveLearnedSet(data.productName, { setCode, productType, language });
        statusEl.textContent = "Saving snapshot...";
        await upsertSnapshot(productId, data);
        statusEl.style.color = "#4ade80";
        statusEl.textContent = "Saved.";
        setTimeout(close, 1000);
      } catch (err) {
        statusEl.style.color = "#f87171";
        statusEl.textContent = "Error: " + err.message;
      }
    };
  }

  function injectTriggerButton() {
    triggerBtn = document.createElement("button");
    triggerBtn.textContent = "Save snapshot";
    triggerBtn.style.cssText =
      "position:fixed;bottom:16px;right:16px;z-index:2147483646;background:#6366f1;color:#fff;" +
      "border:none;border-radius:6px;padding:8px 14px;font:13px system-ui,sans-serif;cursor:pointer;" +
      "box-shadow:0 2px 10px rgba(0,0,0,.3);";
    triggerBtn.onclick = () => {
      if (!ensureConfig()) return;
      showOverlay(extractData());
    };
    document.body.appendChild(triggerBtn);
  }

  injectTriggerButton();
})();
