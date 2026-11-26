// Presentation stays in JavaScript; use the original dashboard's visual rules.
export const presentation = `
[hidden] { display:none !important; }
.tv5-page { --primary:#426454; --primary-dark:#355446; --primary-soft:#edf3ef; }
.tv5-page, .tv5-page * { min-width:0; }
.tv5-page h1 {font-size:1.5rem;font-weight:500;}
.tv5-page h2 {font-size:1.05rem;font-weight:500;margin:0 0 12px;}
.tv5-page h3 {font-size:1rem;font-weight:500;}
.tv5-page p {margin:8px 0;}
.tv5-page svg {flex-shrink:0;}
.tv5-page button, .report-download {display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:8px 14px;border:1px solid var(--border);border-radius:8px;background:white;color:var(--text);cursor:pointer;font:inherit;font-weight:400;text-decoration:none;}
.tv5-page button:hover:not(:disabled), .report-download:hover {background:#f0f2ee;}
.tv5-page button:disabled {opacity:.55;cursor:not-allowed;}
.tv5-page button[aria-selected=true]:hover:not(:disabled) {background:var(--primary-dark);color:white;}
.tv5-page :is(button[type=submit],#submit,#rule-save), .tv5-page button[aria-selected=true] {background:var(--primary);border-color:var(--primary);color:white;}
.page-tabs, .sqi-tabs {display:flex;flex-wrap:wrap;gap:8px;}
.tv5-page label {display:flex;flex-direction:column;gap:4px;color:var(--muted);font-size:.85rem;font-weight:400;}
.tv5-page input:not([type=radio]):not([type=checkbox]), .tv5-page select, .tv5-page textarea {width:100%;padding:9px 11px;border:1px solid var(--border);border-radius:8px;font:inherit;font-size:15px;color:var(--text);background:white;}
.tv5-page textarea {min-height:88px;resize:vertical;}
.tv5-page fieldset {border:1px solid var(--border);border-radius:8px;padding:14px;margin:16px 0;}
.tv5-page legend {color:var(--muted);font-size:.85rem;padding:0 6px;}
.tv5-page .card {box-shadow:none;}
.tv5-page .sqi-card {background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:18px;margin-bottom:16px;}
.tv5-page .card > :last-child {margin-bottom:0;}
.tv5-page table {width:100%;border-collapse:collapse;}
.tv5-page th {text-align:left;font-size:.8rem;color:var(--muted);font-weight:500;padding:8px 10px;border-bottom:1px solid var(--border);white-space:nowrap;background:transparent;}
.tv5-page td {padding:9px 10px;border-bottom:1px solid #f0f2ee;vertical-align:middle;font-size:.9rem;}
.tv5-page :is(.sqi-table-scroll,.report-table-scroll,#report-list,#report-kpis,#alert-list,#rule-list) {overflow-x:auto;}
.tv5-page :is(.sqi-badge,.alert-badge,.report-state,.report-format) {display:inline-block;padding:2px 9px;border-radius:999px;font-size:.75rem;font-weight:400;background:#f1f3f4;color:#52606a;white-space:nowrap;}
.tv5-page [data-tone=HIGH], .tv5-page [data-tone=CRITICAL], .tv5-page [data-state=FAILED] {background:#f6eeed;color:#774d49;}
.tv5-page [data-state=READY] {background:#edf3ef;color:#3d584a;}
.tv5-date-range {display:flex;align-items:end;gap:12px;flex-wrap:wrap;margin-bottom:16px;}
.tv5-date-range label {min-width:180px;}
#selected-score {display:flex;align-items:center;flex-wrap:wrap;gap:12px;margin:12px 0;}
#selected-score > div {display:flex;align-items:center;gap:12px;}
#selected-score strong {font-size:1.1rem;font-weight:500;}
.tv5-chart-layout {display:grid;grid-template-columns:minmax(0,1fr);gap:20px;}
.tv5-chart-layout.has-selection {grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);}
#chart-region {position:relative;}
#chart {display:block;width:100%;height:290px;cursor:crosshair;}
.chart-tooltip {position:absolute;pointer-events:none;background:#fff;border:1px solid var(--border);border-radius:6px;padding:6px 10px;font-size:12px;box-shadow:0 3px 10px #0001;}
#details {border-left:1px solid var(--border);padding-left:16px;overflow-x:auto;}
#details table {min-width:510px;}
#details h2 {font-size:1rem;}
#day-label {max-width:240px;margin-top:12px;}
.indicator-track {display:none;}
.indicator-score {font-variant-numeric:tabular-nums;}
.sqi-row-best {background:transparent;}
.native-pager {display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-top:16px;font-size:.85rem;color:var(--muted);}
.native-pager button {margin-left:6px;}
.actions {display:flex;flex-wrap:wrap;gap:8px;align-items:end;}
#alert-filters {display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;align-items:end;margin-bottom:16px;}
#alert-filters button {justify-self:start;}
#kpi-feedback:empty, [role=status]:empty {display:none;}
#evaluate {display:flex;align-items:end;flex-wrap:wrap;gap:12px;}
#evaluate small {flex-basis:100%;color:var(--muted);}
#rule-form {margin-top:18px;display:block;border-top:1px solid var(--border);padding-top:16px;}
#rule-form > fieldset > label {margin-bottom:14px;}
#rule-form .check {display:flex;flex-direction:row;align-items:center;justify-content:flex-start;gap:8px;}
#rule-form > div, #rule-form .rule-section {display:grid;gap:14px;}
.rule-fields, .logic-builder {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;}
.rule-heading {display:flex;align-items:center;gap:8px;margin:0 0 10px;}
.rule-heading svg, .reco-title svg {width:18px;height:18px;}
.rule-summary {padding:16px;background:#f5f6f4;border:1px solid var(--border);border-radius:8px;align-self:start;}
.rule-summary svg {max-width:20px;max-height:20px;}
.input-suffix {display:flex;position:relative;}
.input-suffix input {padding-right:50px !important;}
.input-suffix > span {position:absolute;right:12px;top:10px;font-size:13px;}
.severity-group {display:flex;gap:12px;flex-wrap:wrap;}
.severity-option, .toggle-label {display:flex !important;flex-direction:row !important;align-items:center;gap:8px;}
.rule-toggle {display:flex;align-items:center;gap:8px;}
.rule-switch {width:auto;}
.record {padding:18px;border:1px solid var(--border);border-radius:10px;background:white;}
.alert-metadata {display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:.85rem;color:var(--muted);}
.reco-box {margin-top:16px;}
.reco-title {display:flex;align-items:center;gap:8px;font-weight:500;}
.reco-item {margin:12px 0;}
.reco-item small {display:block;color:var(--muted);margin:8px 0;}
.record details {margin:14px 0;}
.record dl {display:grid;grid-template-columns:160px 1fr;gap:8px;font-size:.9rem;}
.record dd {margin:0;}
.report-icon {width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8;}
.content > svg {position:absolute;width:0;height:0;overflow:hidden;}
#report-form {display:grid;gap:14px;}
#report-form > div:first-child {display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;}
#report-form > button {justify-self:start;}
#report-form fieldset > div {display:flex;gap:12px;}
.format-option {position:relative;}
.format-option input {position:absolute;width:1px;height:1px;opacity:0;}
.format-card {display:flex;gap:8px;align-items:center;padding:10px 18px;border:1px solid var(--border);border-radius:8px;color:var(--text);cursor:pointer;}
.format-option input:checked + span {background:var(--primary-soft);border-color:var(--primary);}
.format-option input:focus-visible + span {outline:2px solid var(--primary);outline-offset:2px;}
.report-file-name {display:flex;align-items:center;gap:8px;}
.report-history-head {display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:12px;}
.sqi-create-grid, .sqi-input-grid {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;}
.sqi-indicator, .sqi-class {border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:12px;}
.sqi-indicator-fields {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;}
.sqi-indicator-list, .sqi-class-list {display:grid;gap:12px;}
.sqi-editor-fields {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;}
.sqi-panel-body {display:grid;gap:14px;}
.sqi-panel-actions {margin-top:12px;}
.sqi-editor-row {padding:12px;border:1px solid var(--border);border-radius:8px;margin-bottom:12px;}
.sqi-editor-row summary {margin-bottom:0;}
.sqi-editor-row[open] summary {margin-bottom:12px;}
.sqi-editor-content {display:grid;gap:12px;}
.sqi-editor-content > button {justify-self:start;}
.tv5-page label.check {flex-direction:row;align-items:center;gap:8px;}
.tv5-page .alert-select {padding:4px 10px;font-size:.85rem;text-align:left;justify-content:flex-start;}
.tv5-page #alert-list table {min-width:700px;}
.tv5-page #rule-list table {min-width:750px;}
details > summary {cursor:pointer;font-weight:500;margin-bottom:12px;}
@media(max-width:1100px) {.tv5-chart-layout.has-selection {grid-template-columns:1fr;} #details {border-left:0;padding-left:0;} .sqi-create-grid {grid-template-columns:1fr;}}
@media(max-width:820px) {.page-header {flex-wrap:wrap;} .grid-2, #rule-form, #report-form > div:first-child, #alert-filters, .rule-fields, .logic-builder {grid-template-columns:1fr;} .tv5-date-range label {min-width:0;flex:1;} .topbar {padding:10px 16px;} }
`;
