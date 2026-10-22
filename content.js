(() => {
  if (window.__zamzamCapitalCheckerLoaded) return;
  window.__zamzamCapitalCheckerLoaded = true;

  const PANEL_ID = 'zamzam-capital-shariah-panel';
  const $ = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  let rows = [];
  let updatedAt = null;
  let watchlistEnabled = true;
  let debounceTimer;

  function norm(v) {
    return String(v ?? '')
      .trim()
      .toUpperCase()
      .replace(/^(?:NSE|BSE|NFO|MCX|CDS):/i, '')
      .replace(/-(?:EQ|BE|BZ|BL|SM|ST|N1|SG)$/i, '')
      .replace(/\.(?:NS|BO)$/i, '')
      .replace(/[^A-Z0-9]/g, '');
  }

  function normCompany(v) {
    return String(v ?? '')
      .toUpperCase()
      .replace(/&/g, 'AND')
      .replace(/\bLIMITED\b/g, 'LTD')
      .replace(/\bPRIVATE\b/g, 'PVT')
      .replace(/\bINDIA\b/g, '')
      .replace(/[^A-Z0-9]/g, '');
  }

  function getRowTicker(r) {
    return String(r.ticker || r.symbol || r['Trading Symbol'] || r.tradingsymbol || r.Symbol || '').trim().toUpperCase();
  }

  function getRowCompany(r) {
    return String(r.company_name || r.companyName || r['Company Name'] || r.company || r.name || '').trim();
  }

  // Unified Matcher Function
  function matchCompanyToRow(text) {
    const cleanText = String(text || '').trim();
    if (!cleanText || cleanText.length < 2 || !rows.length) return null;

    const targetTicker = norm(cleanText);
    const targetComp = normCompany(cleanText);

    let match = rows.find(r => {
      const rTicker = norm(getRowTicker(r));
      return rTicker && (targetTicker === rTicker || rTicker === targetTicker);
    });
    if (match) return match;

    if (targetComp.includes('GETD') || targetTicker.includes('GETD')) {
      return rows.find(r => norm(getRowTicker(r)).includes('GETD') || normCompany(getRowCompany(r)).includes('GETD')) || null;
    }

    match = rows.find(r => {
      const cNorm = normCompany(getRowCompany(r));
      const tNorm = norm(getRowTicker(r));
      return (cNorm && (targetComp === cNorm || cNorm.includes(targetComp) || targetComp.includes(cNorm))) ||
             (tNorm && (targetTicker === tNorm || tNorm.includes(targetTicker)));
    });

    return match || null;
  }

  function classifyComplianceValue(val) {
    if (val === true || val === 1) return 'compliant';
    if (val === false || val === 0) return 'non-compliant';
    if (val === null || val === undefined) return null;
    const s = String(val).trim().toLowerCase();
    if (/non|not|haram|fail|false|0|negative|doubtful/.test(s)) return 'non-compliant';
    if (/halal|compliant|pass|yes|true|1|positive/.test(s)) return 'compliant';
    return 'non-compliant';
  }

  function resolveRowCompliance(row) {
    const keys = ['shariahStatus', 'shariah_status', 'halal', 'status', 'Status', 'compliance', 'Compliance'];
    for (const k of keys) {
      if (row[k] !== undefined) {
        const res = classifyComplianceValue(row[k]);
        if (res) return res;
      }
    }
    for (const [k, val] of Object.entries(row)) {
      if (/shariah|halal|status|compliance|verdict/i.test(k)) {
        const res = classifyComplianceValue(val);
        if (res) return res;
      }
    }
    return 'non-compliant';
  }

  // Floating Panel UI
  const panel = $('section', 'sc-panel');
  panel.id = PANEL_ID;
  const header = $('div', 'sc-header');
  const brand = $('div', 'sc-brand');
  const mark = $('div', 'sc-mark', 'ZC');
  const brandText = $('div', 'sc-brand-text');
  brandText.append($('strong', '', 'ZAMZAM CAPITAL'),$('small', '', 'PORTFOLIO AUDITOR'));
  brand.append(mark, brandText);

  const controls = $('div', 'sc-controls');
  const wlBtn = $('button', 'sc-icon-btn sc-wl-btn sc-active', 'WL');
  const themeBtn = $('button', 'sc-icon-btn', '◐');
  const minimizeBtn = $('button', 'sc-icon-btn', '−');
  controls.append(wlBtn, themeBtn, minimizeBtn);
  header.append(brand, controls);

  const content = $('div', 'sc-content');
  const symbolLabel = $('div', 'sc-eyebrow', 'UNIVERSAL BROKER DESK');
  const symbol = $('div', 'sc-symbol', 'Portfolio Scanner');
  const company = $('div', 'sc-company', 'Auditing ticker & company rows…');
  const status = $('div', 'sc-status sc-unknown');
  const statusDot = $('span', 'sc-dot');
  const statusText = $('strong', '', 'ACTIVE');
  status.append(statusDot, statusText);

  const multiSection = $('div', 'sc-multi-section');
  multiSection.innerHTML = '<div class="sc-multi-title">DETECTED HOLDINGS</div>';
  const multiList = $('div', 'sc-multi-list');
  multiSection.append(multiList);

  const note = $('p', 'sc-note', 'Supports ticker symbols and company names across all broker terminals.');
  const footer = $('div', 'sc-footer');
  const updated = $('span', '', 'Data not loaded');
  const refreshBtn = $('button', 'sc-refresh', '↻ Refresh');
  footer.append(updated, refreshBtn);

  content.append(symbolLabel, symbol, company, status, multiSection, note, footer);
  panel.append(header, content);
  document.documentElement.append(panel);

  function auditTables() {
    if (!watchlistEnabled || !rows.length) {
      multiList.innerHTML = '';
      document.querySelectorAll('.sc-wl-badge').forEach(el => el.remove());
      return;
    }

    const foundItems = new Map();

    document.querySelectorAll('tbody tr, .holdings-row, table tr, [class*="watchlist-row"]').forEach(tr => {
      if (panel.contains(tr)) return;
      if (tr.querySelector('th')) return;

      // If a badge already exists in this row, skip duplicate creation
      if (tr.querySelector('.sc-wl-badge')) {
        const firstCell = tr.querySelector('td');
        const text = firstCell ? (firstCell.innerText || firstCell.textContent || '').trim().split(/\r?\n/)[0] : '';
        const matchedRow = matchCompanyToRow(text);
        if (matchedRow) {
          const t = getRowTicker(matchedRow);
          const c = getRowCompany(matchedRow);
          const v = resolveRowCompliance(matchedRow);
          if (t && !foundItems.has(t)) {
            foundItems.set(t, { ticker: t, company: c || t, verdict: v });
          }
        }
        return;
      }

      const cells = tr.querySelectorAll('td, div, span');
      if (!cells.length) return;

      let matchedRow = null;
      let targetCell = null;

      for (const cell of Array.from(cells).slice(0, 3)) {
        const text = (cell.innerText || cell.textContent || '').trim().split(/\r?\n/)[0];
        if (!text || text.length < 2 || /^(?:qty|ltp|avg|invested|current|total|p&l|change|%|\d+|-)/i.test(text)) continue;

        matchedRow = matchCompanyToRow(text);
        if (matchedRow) {
          targetCell = cell;
          break;
        }
      }

      if (matchedRow && targetCell) {
        const t = getRowTicker(matchedRow);
        const c = getRowCompany(matchedRow);
        const v = resolveRowCompliance(matchedRow);

        if (t && !foundItems.has(t)) {
          foundItems.set(t, { ticker: t, company: c || t, verdict: v });
        }

        let badge = targetCell.querySelector('.sc-wl-badge');
        if (!badge) {
          badge = $('span', 'sc-wl-badge');
          targetCell.prepend(badge);
        }
        badge.className = `sc-wl-badge ${v === 'compliant' ? 'sc-wl-good' : 'sc-wl-bad'}`;
        badge.textContent = v === 'compliant' ? '● COMPLIANT' : '▲ NON-COMPLIANT';
      }
    });

    multiList.innerHTML = '';
    if (foundItems.size === 0) {
      multiList.innerHTML = '<div style="font-size:10px; color:#88a899; padding:4px;">No holdings detected yet.</div>';
      return;
    }

    for (const item of foundItems.values()) {
      const rowDiv = $('div', 'sc-multi-item');
      rowDiv.innerHTML = `<span><strong>${item.ticker}</strong></span><span class="sc-mini-badge ${item.verdict === 'compliant' ? 'sc-mini-good' : 'sc-mini-bad'}">${item.verdict === 'compliant' ? 'COMPLIANT' : 'NON-COMPLIANT'}</span>`;
      multiList.append(rowDiv);
    }
  }

  async function loadData(force = false) {
    if (force) {
      refreshBtn.disabled = true;
      refreshBtn.textContent = 'Loading…';
    }
    try {
      if (force) await chrome.runtime.sendMessage({ type: 'REFRESH_DATA' });
      const data = await chrome.runtime.sendMessage({ type: 'GET_DATA' });
      rows = Array.isArray(data?.zamzamCapitalRows) ? data.zamzamCapitalRows : [];
      updatedAt = data?.zamzamCapitalUpdatedAt || null;
      updated.textContent = updatedAt ? `Updated ${new Date(updatedAt).toLocaleTimeString()}` : 'Data not loaded';
      auditTables();
    } catch (_) {
      note.textContent = 'Could not load data.';
    } finally {
      refreshBtn.disabled = false;
      refreshBtn.textContent = '↻ Refresh';
    }
  }

  wlBtn.addEventListener('click', () => {
    watchlistEnabled = !watchlistEnabled;
    wlBtn.classList.toggle('sc-active', watchlistEnabled);
    auditTables();
  });
  themeBtn.addEventListener('click', () => panel.classList.toggle('sc-light'));
  minimizeBtn.addEventListener('click', () => {
    panel.classList.toggle('sc-minimized');
    minimizeBtn.textContent = panel.classList.contains('sc-minimized') ? '+' : '−';
  });
  refreshBtn.addEventListener('click', () => loadData(true));

  setInterval(auditTables, 1000);
  loadData(false);
})();