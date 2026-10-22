# Zamzam Capital Shariah Checker — Chrome Extension

A Manifest V3 extension that injects a movable floating panel into TradingView and attempts to detect the active ticker automatically. It fetches screener records from the configured Cloudflare API and caches them locally, with a daily refresh alarm.

## Install
1. Extract this ZIP to a folder.
2. Open `chrome://extensions` in Google Chrome.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the extracted `zamzam-capital-shariah-extension` folder.
5. Open/reload a TradingView chart tab.
6. Use the extension popup's refresh button if data is not loaded.

## Data source
Configured endpoint: `https://excell-final-worker.saif-ace.workers.dev/api/rows`

The API must permit requests from a Chrome extension and return JSON as an array of records, or an object with a `rows`, `data`, or `results` array. The field names for ticker, company, industry, sector, and compliance status vary by dataset. The code supports several common names, but may need adjustment to match the actual response. If the compliance field is unknown or no ticker matches, the panel displays **UNVERIFIED**, not a guessed status.

## Notes / limitations
- TradingView can change its page markup and symbol-title format; ticker detection may need adjustment if the symbol is not detected on your specific layout.
- The daily refresh alarm is best-effort; Chrome controls when extension alarms run. The popup offers manual refresh too.
- This is a starter build and has not been verified against the live API schema or tested in your logged-in TradingView session.
- Compliance labels are informational and should be checked against your chosen Shariah screening methodology and latest source data.


Version 1.0.3: fixed boolean compliance handling for the API schema (`ticker`, `companyName`, boolean `status`, `sector`, `industry`). `status: true` displays COMPLIANT and `status: false` displays NON-COMPLIANT.


Version 1.0.4: ticker detection now prioritizes visible TradingView symbol controls and ignores hidden/stale matching elements; URL symbol is only a fallback. It rechecks more frequently while the chart remains open.


### Version 1.0.5
Prevents ticker bounce-back during TradingView single-page chart rerenders by ignoring conflicting ticker candidates briefly after a detected symbol change. It also avoids stale URL/title fallbacks.


## Version 1.0.6 ticker-detection changes
- Uses the visible chart legend/company title to resolve the active ticker against the API dataset before consulting symbol controls.
- Restricts fallback scanning to the top-left chart header and excludes the extension panel.
- Removes fuzzy ticker suffix matching to avoid showing the wrong company's compliance record.
- Does not use the page URL or document title as a ticker source.