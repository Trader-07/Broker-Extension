const status = document.getElementById('data-status');
const input = document.getElementById('lookup-input');
const resultBox = document.getElementById('lookup-result');
const summaryContainer = document.getElementById('summary-container');
let cachedRows = [];

function norm(v) { return String(v ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function normC(v) { return String(v ?? '').toUpperCase().replace(/&/g, 'AND').replace(/\bLIMITED\b/g, 'LTD').replace(/\bINDIA\b/g, '').replace(/[^A-Z0-9]/g, ''); }
function getTicker(r) { return String(r.ticker || r.symbol || r['Trading Symbol'] || r.tradingsymbol || r.Symbol || '').trim().toUpperCase(); }
function getCompany(r) { return String(r.company_name || r.companyName || r['Company Name'] || r.company || r.name || '').trim(); }

function isCompliant(r) {
  const keys = ['shariahStatus', 'shariah_status', 'halal', 'status', 'Status', 'compliance', 'Compliance'];
  let val = null;
  for (const k of keys) {
    if (r[k] !== undefined) { val = r[k]; break; }
  }
  if (val === null) {
    for (const [k, v] of Object.entries(r)) {
      if (/shariah|halal|status|compliance|verdict/i.test(k)) { val = v; break; }
    }
  }
  if (val === true || val === 1) return true;
  if (val === false || val === 0) return false;
  const s = String(val ?? '').toLowerCase();
  if (/non|not|haram|fail|false|0|negative|doubtful/.test(s)) return false;
  if (/halal|compliant|pass|yes|true|1|positive/.test(s)) return true;
  return false;
}

function matchCompany(name) {
  const target = normC(name);
  if (!target || target.length < 2) return null;
  if (target.includes('GETD')) return cachedRows.find(r => norm(getTicker(r)).includes('GETD')) || null;
  return cachedRows.find(r => {
    const c = normC(getCompany(r));
    const t = norm(getTicker(r));
    return (c && (target === c || c.includes(target))) || (t && (target === t || t.includes(target)));
  }) || null;
}

async function update() {
  const d = await chrome.runtime.sendMessage({ type: 'GET_DATA' });
  cachedRows = Array.isArray(d?.zamzamCapitalRows) ? d.zamzamCapitalRows : [];
  status.textContent = cachedRows.length ? `${cachedRows.length} screener records loaded.` : 'No screener records loaded.';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const found = [];
          document.querySelectorAll('tr, .holdings-row, [class*="stock-row"]').forEach(tr => {
            const cell = tr.querySelector('td, div');
            if (cell) {
              const txt = (cell.innerText || cell.textContent || '').trim().split(/\r?\n/)[0];
              if (txt && txt.length > 2 && !/^(?:qty|ltp|avg|invested|current|total|p&l|change|%|\d+|-)/i.test(txt)) {
                if (!found.includes(txt)) found.push(txt);
              }
            }
          });
          return found;
        }
      }, (res) => {
        if (res && res[0]?.result) renderSummary(res[0].result);
      });
    }
  } catch (_) {
    summaryContainer.innerHTML = '<div style="font-size:11px; color:#a9c5b8; padding:10px; text-align:center;">Open a broker portfolio or holdings tab.</div>';
  }
}

function renderSummary(names) {
  if (!names.length || !cachedRows.length) {
    summaryContainer.innerHTML = '<div style="font-size:11px; color:#a9c5b8; padding:10px; text-align:center;">No holdings found on active page.</div>';
    return;
  }

  let compliantCount = 0;
  let nonCompliantCount = 0;
  const itemsHtml = [];

  for (const name of names) {
    const match = matchCompany(name);
    const ticker = match ? getTicker(match) : name.substring(0, 12).toUpperCase();
    const ok = match ? isCompliant(match) : false;

    if (ok) compliantCount++;
    else nonCompliantCount++;

    itemsHtml.push(`
      <div class="summary-item">
        <span class="summary-ticker"><strong>${ticker}</strong><small>${name.substring(0, 18)}</small></span>
        <span class="summary-badge ${ok ? 'good' : 'bad'}">${ok ? 'COMPLIANT' : 'NON-COMPLIANT'}</span>
      </div>
    `);
  }

  summaryContainer.innerHTML = `
    <div class="summary-header-stats">
      <span class="stat-good">✓ ${compliantCount} Compliant</span>
      <span class="stat-bad">▲ ${nonCompliantCount} Non-Compliant</span>
    </div>
    <div class="summary-list">${itemsHtml.join('')}</div>
  `;
}

input.addEventListener('input', () => {
  const q = norm(input.value);
  if (!q) { resultBox.hidden = true; return; }
  const match = cachedRows.find(r => norm(getTicker(r)) === q) || matchCompany(input.value);
  resultBox.hidden = false;
  if (!match) {
    resultBox.innerHTML = `<strong>${input.value.toUpperCase()}</strong><br><span>Not found.</span>`;
    return;
  }
  const ok = isCompliant(match);
  resultBox.innerHTML = `<strong>${getTicker(match)}</strong> — ${getCompany(match)}<br><span class="badge ${ok ? 'good' : 'bad'}">${ok ? '● COMPLIANT' : '▲ NON-COMPLIANT'}</span>`;
});

document.getElementById('refresh').addEventListener('click', async () => {
  status.textContent = 'Refreshing…';
  await chrome.runtime.sendMessage({ type: 'REFRESH_DATA' });
  await update();
});

update();