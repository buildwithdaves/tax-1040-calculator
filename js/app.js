'use strict';
// ============================================================
//  APP.JS  —  State management, UI rendering, navigation
//  Depends on: taxRules.js, calculator.js, ocr.js
// ============================================================

// ── Initial State ─────────────────────────────────────────────
function createInitialState() {
  return {
    personalInfo: {
      firstName: '', lastName: '', ssn: '', filingStatus: 'single',
      age: '', blind: false, spouseFirstName: '', spouseLastName: '',
      spouseAge: '', spouseBlind: false, occupation: '',
      hsaCoverage: 'self', canBeDependent: false
    },
    dependents: [],
    w2: [],
    selfEmployment: [],
    interest: [],
    dividends: [],
    capitalGains: [],
    retirement: [],
    socialSecurity: { netBenefits: '', federalWithholding: '' },
    rental: [],
    k1: [],
    other: {
      gambling: '', unemployment: '', stateRefund: '', priorYearItemized: false,
      alimonyReceived: '', alimonyPaid: '', divorcePreTCJA: false,
      prizes: '', farmIncome: '', otherMisc: '', otherWithholding: '',
      soldHome: false, homeSaleProceeds: '', homePurchasePrice: '',
      homeImprovements: '', homeSellingCosts: '', meetsOwnershipTest: false
    },
    adjustments: {
      educatorExpenses: '', studentLoanInterest: '', hsaContributions: '',
      selfEmployedHealthInsurance: '', iraContribution: '', coveredByWorkplacePlan: false,
      spouseCoveredByPlan: false, alimonyPaid: '', earlyWithdrawalPenalty: '',
      retirementPlanContrib: ''
    },
    deductions: { forceItemized: false },
    itemized: {
      medicalExpenses: '', stateIncomeTax: '', localIncomeTax: '', realEstateTax: '',
      mortgageInterest: '', pointsPaid: '', charitableCash: '', charitableNonCash: '',
      investmentInterest: '', gamblingLosses: '', casualtyLoss: '', other: ''
    },
    credits: {
      dependentCareExpenses: '', dependentCarePersons: 1,
      aocExpenses: '', llcExpenses: '', retirementContributions: '',
      solarInstallation: '', windEnergy: '', batteryStorage: '',
      energyImprovements: {
        windows: '', doors: '', hvac: '', insulation: '',
        heatPump: '', energyAudit: '', waterHeater: ''
      },
      foreignTax: '', premiumTaxCredit: '', adoptionCredit: '', other: ''
    },
    payments: { estimatedTax: '', extensionPayment: '' }
  };
}

let state = createInitialState();
let currentStep = 1;
const TOTAL_STEPS = 12;

// ── Utility helpers ───────────────────────────────────────────
const $ = id => document.getElementById(id);
const fmt = n => isNaN(n) ? '$0' : '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = n => (n * 100).toFixed(1) + '%';
const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const uid = () => Math.random().toString(36).slice(2, 9);

// ── Help Modal ────────────────────────────────────────────────
function showHelp(topic) {
  const text = HELP_TEXT[topic] || 'No additional information available.';
  $('help-body').innerHTML = text.replace(/\n/g, '<br>').replace(/•/g, '<span class="bullet">•</span>');
  $('help-modal').classList.add('active');
}

function closeHelp() {
  $('help-modal').classList.remove('active');
}

// ── Navigation ────────────────────────────────────────────────
const STEP_NAMES = [
  '', // 1-indexed
  'Personal Info',
  'Upload Documents',
  'W-2 Income',
  'Self-Employment',
  'Investment Income',
  'Retirement',
  'Real Estate & Other',
  'Adjustments',
  'Deductions',
  'Tax Credits',
  'Other Taxes & Payments',
  'Results'
];

function navigateTo(step) {
  if (step < 1 || step > TOTAL_STEPS) return;
  currentStep = step;
  renderApp();
}

function nextStep() { navigateTo(currentStep + 1); }
function prevStep() { navigateTo(currentStep - 1); }

// ── Render Progress Bar ───────────────────────────────────────
function renderProgress() {
  const pct = ((currentStep - 1) / (TOTAL_STEPS - 1)) * 100;
  $('progress-bar-fill').style.width = pct + '%';
  $('progress-label').textContent = `Step ${currentStep} of ${TOTAL_STEPS}: ${STEP_NAMES[currentStep]}`;

  // Update step nav dots
  const nav = $('step-nav');
  nav.innerHTML = STEP_NAMES.slice(1).map((name, i) => {
    const n = i + 1;
    const cls = n < currentStep ? 'done' : n === currentStep ? 'active' : '';
    return `<button class="step-dot ${cls}" onclick="navigateTo(${n})" title="${name}">${n < currentStep ? '✓' : n}</button>`;
  }).join('');
}

// ── Render Live Summary ───────────────────────────────────────
function renderLiveSummary() {
  try {
    const result = calculateTax(state);
    const s = $('live-summary');
    if (!s) return;
    s.innerHTML = `
      <div class="live-row"><span>Total Income</span><span>${fmt(result.income.subtotal)}</span></div>
      <div class="live-row"><span>AGI</span><span>${fmt(result.agi)}</span></div>
      <div class="live-row"><span>Taxable Income</span><span>${fmt(result.taxableIncome)}</span></div>
      <div class="live-row highlight"><span>Total Tax</span><span>${fmt(result.totalTax)}</span></div>
      <div class="live-row ${result.balance < 0 ? 'refund' : 'owe'}">
        <span>${result.balance < 0 ? '🎉 Refund' : '⚠ Amount Owed'}</span>
        <span>${fmt(Math.abs(result.balance))}</span>
      </div>
    `;
  } catch(e) { /* ignore errors during partial input */ }
}

// ── Help button HTML ──────────────────────────────────────────
function helpBtn(topic) {
  return `<button class="help-btn" onclick="showHelp('${topic}')" title="Learn more">?</button>`;
}

// ── Input helpers ─────────────────────────────────────────────
function moneyInput(id, value, placeholder, label, helpTopic) {
  return `
    <div class="field-group">
      <label for="${id}">${label}${helpTopic ? helpBtn(helpTopic) : ''}</label>
      <div class="input-money">
        <span class="dollar-sign">$</span>
        <input type="number" id="${id}" min="0" step="0.01" value="${esc(value)}" placeholder="${placeholder || '0.00'}"
          oninput="handleInput(event)" class="money-input">
      </div>
    </div>`;
}

function textInput(id, value, placeholder, label) {
  return `
    <div class="field-group">
      <label for="${id}">${label}</label>
      <input type="text" id="${id}" value="${esc(value)}" placeholder="${placeholder || ''}"
        oninput="handleInput(event)">
    </div>`;
}

function selectInput(id, value, label, options, helpTopic) {
  const opts = options.map(([v, l]) =>
    `<option value="${v}" ${String(value) === String(v) ? 'selected' : ''}>${l}</option>`
  ).join('');
  return `
    <div class="field-group">
      <label for="${id}">${label}${helpTopic ? helpBtn(helpTopic) : ''}</label>
      <select id="${id}" onchange="handleInput(event)">${opts}</select>
    </div>`;
}

function checkboxInput(id, checked, label, helpTopic) {
  return `
    <div class="field-group checkbox-group">
      <label>
        <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} onchange="handleInput(event)">
        ${label}${helpTopic ? helpBtn(helpTopic) : ''}
      </label>
    </div>`;
}

// ── Event Delegation ──────────────────────────────────────────
function handleInput(event) {
  const el = event.target;
  const id = el.id;
  if (!id) return;
  const val = el.type === 'checkbox' ? el.checked : el.value;
  setStateByPath(id, val);
  renderLiveSummary();
}

function setStateByPath(id, value) {
  // ID format: section.key or section[idx].key or section[idx].sub.key
  const parts = id.split('.');
  let obj = state;
  for (let i = 0; i < parts.length - 1; i++) {
    const match = parts[i].match(/^(\w+)\[(\d+)\]$/);
    if (match) {
      obj = obj[match[1]][parseInt(match[2])];
    } else {
      obj = obj[parts[i]];
    }
    if (!obj) return;
  }
  const lastPart = parts[parts.length - 1];
  const lastMatch = lastPart.match(/^(\w+)\[(\d+)\]$/);
  if (lastMatch) {
    obj[lastMatch[1]][parseInt(lastMatch[2])] = value;
  } else {
    obj[lastPart] = value;
  }
}

// ── STEP RENDERERS ────────────────────────────────────────────

// Step 1: Personal Information
function renderStep1() {
  return `
    <div class="step-header">
      <h2>Personal Information</h2>
      <p class="step-desc">Tell us about yourself. This determines your filing status and tax rates.</p>
    </div>
    <div class="card">
      <h3>Your Information</h3>
      <div class="grid-2">
        ${textInput('personalInfo.firstName', state.personalInfo.firstName, 'First Name', 'First Name')}
        ${textInput('personalInfo.lastName', state.personalInfo.lastName, 'Last Name', 'Last Name')}
      </div>
      <div class="grid-2">
        ${textInput('personalInfo.age', state.personalInfo.age, 'e.g. 35', 'Your Age (as of Dec 31, 2025)')}
        ${textInput('personalInfo.occupation', state.personalInfo.occupation, 'e.g. Software Engineer', 'Occupation')}
      </div>
      ${checkboxInput('personalInfo.blind', state.personalInfo.blind, 'I am blind or severely visually impaired (increases standard deduction)')}
    </div>

    <div class="card">
      <h3>Filing Status ${helpBtn('filingStatus')}</h3>
      <div class="filing-status-grid">
        ${['single','mfj','mfs','hoh','qss'].map(fs => {
          const labels = { single:'Single', mfj:'Married Filing Jointly', mfs:'Married Filing Separately', hoh:'Head of Household', qss:'Qualifying Surviving Spouse' };
          const descs = { single:'Unmarried, legally separated, or divorced', mfj:'Married and filing one return (usually best)', mfs:'Married but filing separate returns', hoh:'Unmarried with a qualifying dependent', qss:'Widowed with dependent child (2 years)' };
          const checked = state.personalInfo.filingStatus === fs;
          return `<label class="filing-card ${checked ? 'selected' : ''}">
            <input type="radio" name="filingStatus" value="${fs}" ${checked ? 'checked' : ''}
              onchange="state.personalInfo.filingStatus='${fs}'; renderApp();">
            <strong>${labels[fs]}</strong>
            <span>${descs[fs]}</span>
          </label>`;
        }).join('')}
      </div>
    </div>

    ${(state.personalInfo.filingStatus === 'mfj' || state.personalInfo.filingStatus === 'mfs') ? `
    <div class="card">
      <h3>Spouse Information</h3>
      <div class="grid-2">
        ${textInput('personalInfo.spouseFirstName', state.personalInfo.spouseFirstName, 'First Name', "Spouse's First Name")}
        ${textInput('personalInfo.spouseLastName', state.personalInfo.spouseLastName, 'Last Name', "Spouse's Last Name")}
      </div>
      ${textInput('personalInfo.spouseAge', state.personalInfo.spouseAge, 'e.g. 33', "Spouse's Age (as of Dec 31, 2025)")}
      ${checkboxInput('personalInfo.spouseBlind', state.personalInfo.spouseBlind, 'Spouse is blind or severely visually impaired')}
    </div>` : ''}

    <div class="card">
      <h3>Dependents</h3>
      <p class="note">Include all people who qualify as your dependents: children, parents, relatives you support. ${helpBtn('childTaxCredit')}</p>
      <div id="dependents-list">
        ${state.dependents.map((dep, i) => renderDependent(dep, i)).join('')}
      </div>
      <button class="btn-add" onclick="addDependent()">+ Add Dependent</button>
    </div>

    <div class="card">
      <h3>HSA Coverage</h3>
      ${selectInput('personalInfo.hsaCoverage', state.personalInfo.hsaCoverage, 'Health Savings Account (HSA) Plan Type', [['self','Self-Only Plan'],['family','Family Plan'],['none','No HSA']])}
    </div>
  `;
}

function renderDependent(dep, i) {
  return `<div class="dependent-card">
    <div class="dependent-header">
      <strong>Dependent ${i+1}</strong>
      <button class="btn-remove" onclick="removeDependent(${i})">✕ Remove</button>
    </div>
    <div class="grid-3">
      <div class="field-group">
        <label>Full Name</label>
        <input type="text" value="${esc(dep.name)}" placeholder="Name"
          oninput="state.dependents[${i}].name=this.value">
      </div>
      <div class="field-group">
        <label>Age</label>
        <input type="number" value="${esc(dep.age)}" placeholder="Age" min="0" max="130"
          oninput="state.dependents[${i}].age=this.value; renderLiveSummary()">
      </div>
      <div class="field-group">
        <label>Relationship</label>
        <select onchange="state.dependents[${i}].relationship=this.value">
          ${['Child','Stepchild','Foster Child','Parent','Grandparent','Sibling','Other Relative'].map(r =>
            `<option ${dep.relationship===r?'selected':''}>${r}</option>`
          ).join('')}
        </select>
      </div>
    </div>
    <div class="grid-2">
      <div class="field-group checkbox-group">
        <label><input type="checkbox" ${dep.qualifying?'checked':''} onchange="state.dependents[${i}].qualifying=this.checked; renderLiveSummary()"> Qualifying child/relative (can claim tax credit)</label>
      </div>
      <div class="field-group checkbox-group">
        <label><input type="checkbox" ${dep.fullYear?'checked':''} onchange="state.dependents[${i}].fullYear=this.checked"> Lived with you all year</label>
      </div>
    </div>
  </div>`;
}

function addDependent() {
  state.dependents.push({ id: uid(), name: '', age: '', relationship: 'Child', qualifying: true, fullYear: true });
  renderApp();
}

function removeDependent(i) {
  state.dependents.splice(i, 1);
  renderApp();
}

// Step 2: Document Upload
function renderStep2() {
  return `
    <div class="step-header">
      <h2>Upload Tax Documents</h2>
      <p class="step-desc">Upload photos or scans of your tax forms (W-2, 1099s, etc.) and we'll automatically extract the numbers. Or skip to Step 3 and enter manually.</p>
    </div>
    <div class="card">
      <h3>How It Works</h3>
      <div class="how-it-works">
        <div class="step-icon">📸</div><p>Take a clear photo or scan of your tax form</p>
        <div class="step-icon">🔍</div><p>Our OCR technology reads the numbers automatically</p>
        <div class="step-icon">✏️</div><p>Review and confirm the extracted data</p>
        <div class="step-icon">✅</div><p>Data is filled in automatically for you</p>
      </div>
      <div class="supported-forms">
        <strong>Supported Forms:</strong>
        <div class="form-badges">
          ${['W-2','1099-INT','1099-DIV','1099-B','1099-NEC','1099-MISC','1099-R','SSA-1099','1099-K'].map(f =>
            `<span class="badge">${f}</span>`).join('')}
        </div>
      </div>
    </div>

    <div class="card">
      <h3>Upload Documents</h3>
      <div class="upload-area" id="upload-area" ondragover="event.preventDefault()" ondrop="handleFileDrop(event)">
        <div class="upload-icon">📄</div>
        <p><strong>Drag & drop files here</strong> or</p>
        <label class="btn-upload">
          Browse Files
          <input type="file" accept="image/*,.pdf" multiple id="file-input" onchange="handleFileSelect(event)" style="display:none">
        </label>
        <p class="upload-hint">Supports: JPG, PNG, HEIC, PDF • Max 10MB per file</p>
      </div>
      <div id="ocr-progress" style="display:none">
        <div class="progress-track">
          <div class="progress-fill" id="ocr-fill" style="width:0%"></div>
        </div>
        <p id="ocr-status">Processing...</p>
      </div>
      <div id="ocr-results"></div>
    </div>

    <div class="card tip-card">
      <h3>💡 Tips for Best Results</h3>
      <ul>
        <li>Ensure the document is flat and well-lit</li>
        <li>Capture the entire form including all boxes</li>
        <li>Higher resolution = better accuracy</li>
        <li>You can always edit any extracted values manually in the following steps</li>
      </ul>
    </div>
  `;
}

// Step 3: W-2 Income
function renderStep3() {
  return `
    <div class="step-header">
      <h2>W-2 Wages & Salary ${helpBtn('w2Box1')}</h2>
      <p class="step-desc">Enter information from each W-2 you received. You'll have one W-2 per employer. Most boxes are optional — at minimum enter Box 1 and Box 2.</p>
    </div>
    ${state.w2.length === 0 ? `<div class="empty-state">
      <p>No W-2 forms added yet. Click below to add your first W-2.</p>
    </div>` : ''}
    ${state.w2.map((w, i) => renderW2(w, i)).join('')}
    <button class="btn-add" onclick="addW2()">+ Add W-2</button>
  `;
}

function renderW2(w, i) {
  return `<div class="card form-card">
    <div class="form-card-header">
      <h3>W-2 #${i+1} — ${esc(w.employerName) || 'Employer'}</h3>
      <button class="btn-remove" onclick="removeItem('w2',${i})">✕ Remove</button>
    </div>
    ${textInput(`w2[${i}].employerName`, w.employerName, "Company name", "Employer Name")}
    <div class="form-divider">Key Boxes (Required)</div>
    <div class="grid-2">
      ${moneyInput(`w2[${i}].box1`, w.box1, '0.00', 'Box 1 — Wages, Tips, Other Compensation', 'w2Box1')}
      ${moneyInput(`w2[${i}].box2`, w.box2, '0.00', 'Box 2 — Federal Income Tax Withheld', 'w2Box2')}
    </div>
    <div class="form-divider">Social Security & Medicare (Optional)</div>
    <div class="grid-2">
      ${moneyInput(`w2[${i}].box3`, w.box3, '0.00', 'Box 3 — Social Security Wages')}
      ${moneyInput(`w2[${i}].box4`, w.box4, '0.00', 'Box 4 — Social Security Tax Withheld')}
    </div>
    <div class="grid-2">
      ${moneyInput(`w2[${i}].box5`, w.box5, '0.00', 'Box 5 — Medicare Wages and Tips')}
      ${moneyInput(`w2[${i}].box6`, w.box6, '0.00', 'Box 6 — Medicare Tax Withheld')}
    </div>
    <div class="form-divider">Box 12 Codes (Optional — enter amounts)</div>
    <div class="grid-2">
      ${moneyInput(`w2[${i}].box12d`, w.box12d, '0.00', 'Box 12 Code D — 401(k) Contributions')}
      ${moneyInput(`w2[${i}].box12w`, w.box12w, '0.00', 'Box 12 Code W — Employer HSA Contributions')}
      ${moneyInput(`w2[${i}].box12e`, w.box12e, '0.00', 'Box 12 Code E — 403(b) Contributions')}
      ${moneyInput(`w2[${i}].box12aa`, w.box12aa, '0.00', 'Box 12 Code AA — Roth 401(k) Contributions')}
    </div>
    <div class="form-divider">State (Optional)</div>
    <div class="grid-2">
      ${moneyInput(`w2[${i}].box16`, w.box16, '0.00', 'Box 16 — State Wages')}
      ${moneyInput(`w2[${i}].box17`, w.box17, '0.00', 'Box 17 — State Income Tax Withheld')}
    </div>
  </div>`;
}

function addW2() {
  state.w2.push({ id: uid(), employerName: '', box1: '', box2: '', box3: '', box4: '', box5: '', box6: '', box12d: '', box12w: '', box12e: '', box12aa: '', box16: '', box17: '' });
  renderApp();
}

// Step 4: Self-Employment
function renderStep4() {
  return `
    <div class="step-header">
      <h2>Self-Employment & 1099 Income ${helpBtn('selfEmploymentIncome')}</h2>
      <p class="step-desc">Include income from freelancing, consulting, gig work (Uber, DoorDash, etc.), or any business you run. Each 1099-NEC or business should be a separate entry.</p>
    </div>
    <div class="card info-card">
      <p><strong>Key fact:</strong> Self-employment tax (15.3%) applies to your net profit. But you can deduct all legitimate business expenses AND deduct half the SE tax from your income.</p>
    </div>
    ${state.selfEmployment.length === 0 ? `<div class="empty-state"><p>No self-employment income added. Click below to add.</p></div>` : ''}
    ${state.selfEmployment.map((b, i) => renderSelfEmp(b, i)).join('')}
    <button class="btn-add" onclick="addSelfEmployment()">+ Add Business / 1099-NEC</button>

    <div class="card" style="margin-top:1.5rem">
      <h3>1099-K Income (Payment Processors) ${helpBtn('selfEmploymentIncome')}</h3>
      <p class="note">If you received a 1099-K from Venmo, PayPal, Stripe, Etsy, etc. for goods/services, include that gross income in the appropriate business entry above. If it was for personal item sales (sold at a loss), it's not taxable.</p>
    </div>
  `;
}

function renderSelfEmp(b, i) {
  const net = (parseFloat(b.revenue)||0) - (parseFloat(b.expenses)||0);
  const se = net > 0 ? net * 0.9235 * 0.153 : 0;
  return `<div class="card form-card">
    <div class="form-card-header">
      <h3>Business #${i+1} — ${esc(b.name) || '(No name)'}</h3>
      <button class="btn-remove" onclick="removeItem('selfEmployment',${i})">✕ Remove</button>
    </div>
    ${textInput(`selfEmployment[${i}].name`, b.name, 'Business or client name', 'Business / Payer Name')}
    <div class="grid-2">
      ${moneyInput(`selfEmployment[${i}].revenue`, b.revenue, '0.00', 'Gross Revenue / 1099-NEC Box 1', 'selfEmploymentIncome')}
      ${moneyInput(`selfEmployment[${i}].expenses`, b.expenses, '0.00', 'Total Business Expenses')}
    </div>
    <div class="calc-preview">
      <div class="calc-row"><span>Net Profit</span><span class="${net<0?'neg':''}">${fmt(net)}</span></div>
      <div class="calc-row"><span>Est. SE Tax (15.3%)</span><span>${fmt(se)}</span></div>
      <div class="calc-row small"><span>½ SE Tax deduction</span><span>${fmt(se/2)}</span></div>
    </div>
    <details class="expense-details">
      <summary>📋 Itemize Business Expenses (optional)</summary>
      <div class="expense-grid">
        ${['advertising','carMileage','commissions','insurance','legal','meals','officeSupplies','rent','repairs','travel','utilities','wages','otherExp'].map(exp => {
          const labels = {advertising:'Advertising',carMileage:'Car & Truck (actual)',commissions:'Commissions & Fees',insurance:'Insurance',legal:'Legal & Professional',meals:'Meals (50% deductible)',officeSupplies:'Office Supplies',rent:'Rent/Lease',repairs:'Repairs & Maintenance',travel:'Travel',utilities:'Utilities',wages:'Wages Paid',otherExp:'Other Expenses'};
          return moneyInput(`selfEmployment[${i}].${exp}`, b[exp], '0.00', labels[exp]);
        }).join('')}
      </div>
    </details>
    ${checkboxInput(`selfEmployment[${i}].isQBI`, b.isQBI, 'Qualifies for QBI Deduction (Sec. 199A) — not a specified service trade', 'qbi')}
    ${moneyInput(`selfEmployment[${i}].federalWithholding`, b.federalWithholding, '0.00', 'Federal Tax Withheld (1099-NEC Box 4)')}
  </div>`;
}

function addSelfEmployment() {
  state.selfEmployment.push({ id: uid(), name: '', revenue: '', expenses: '', isQBI: true, federalWithholding: '' });
  renderApp();
}

// Step 5: Investment Income
function renderStep5() {
  return `
    <div class="step-header">
      <h2>Investment Income</h2>
      <p class="step-desc">Enter interest (1099-INT), dividends (1099-DIV), and capital gains (1099-B / Schedule D). Long-term capital gains are taxed at lower rates!</p>
    </div>

    <div class="card">
      <h3>Interest Income (1099-INT) ${helpBtn('niit')}</h3>
      ${state.interest.map((it, i) => renderInterest(it, i)).join('')}
      <button class="btn-add" onclick="addInterest()">+ Add 1099-INT</button>
    </div>

    <div class="card">
      <h3>Dividends (1099-DIV) ${helpBtn('qualifiedDividends')}</h3>
      ${state.dividends.map((d, i) => renderDividend(d, i)).join('')}
      <button class="btn-add" onclick="addDividend()">+ Add 1099-DIV</button>
    </div>

    <div class="card">
      <h3>Capital Gains / Losses (1099-B, Schedule D) ${helpBtn('capitalGains')}</h3>
      <div class="info-card card" style="margin-bottom:1rem">
        <p><strong>Short-term</strong> (held ≤ 1 year): taxed as ordinary income (10–37%)</p>
        <p><strong>Long-term</strong> (held &gt; 1 year): taxed at 0%, 15%, or 20%</p>
        <p><strong>Wash sale rule:</strong> If you sell at a loss and rebuy within 30 days, the loss is disallowed. ${helpBtn('washSale')}</p>
      </div>
      ${state.capitalGains.map((g, i) => renderCapGain(g, i)).join('')}
      <button class="btn-add" onclick="addCapGain()">+ Add Capital Gain/Loss Transaction</button>
    </div>
  `;
}

function renderInterest(it, i) {
  return `<div class="sub-card">
    <div class="sub-card-header">
      <strong>${esc(it.payerName) || 'Bank/Institution'}</strong>
      <button class="btn-remove-sm" onclick="removeItem('interest',${i})">✕</button>
    </div>
    <div class="grid-2">
      ${textInput(`interest[${i}].payerName`, it.payerName, 'Bank or institution name', 'Payer Name')}
      ${moneyInput(`interest[${i}].box1`, it.box1, '0.00', 'Box 1 — Taxable Interest')}
    </div>
    <div class="grid-2">
      ${moneyInput(`interest[${i}].taxExempt`, it.taxExempt, '0.00', 'Box 8 — Tax-Exempt Interest (municipal bonds)')}
      ${moneyInput(`interest[${i}].federalWithholding`, it.federalWithholding, '0.00', 'Box 4 — Federal Tax Withheld')}
    </div>
  </div>`;
}

function addInterest() {
  state.interest.push({ id: uid(), payerName: '', box1: '', taxExempt: '', federalWithholding: '' });
  renderApp();
}

function renderDividend(d, i) {
  return `<div class="sub-card">
    <div class="sub-card-header">
      <strong>${esc(d.payerName) || 'Fund/Company'}</strong>
      <button class="btn-remove-sm" onclick="removeItem('dividends',${i})">✕</button>
    </div>
    <div class="grid-2">
      ${textInput(`dividends[${i}].payerName`, d.payerName, 'Fund or company name', 'Payer Name')}
      ${moneyInput(`dividends[${i}].ordinary`, d.ordinary, '0.00', 'Box 1a — Total Ordinary Dividends')}
    </div>
    <div class="grid-2">
      ${moneyInput(`dividends[${i}].qualified`, d.qualified, '0.00', 'Box 1b — Qualified Dividends (taxed at lower rates)', 'qualifiedDividends')}
      ${moneyInput(`dividends[${i}].capGainDist`, d.capGainDist, '0.00', 'Box 2a — Capital Gain Distributions')}
    </div>
    ${moneyInput(`dividends[${i}].federalWithholding`, d.federalWithholding, '0.00', 'Box 4 — Federal Tax Withheld')}
  </div>`;
}

function addDividend() {
  state.dividends.push({ id: uid(), payerName: '', ordinary: '', qualified: '', capGainDist: '', federalWithholding: '' });
  renderApp();
}

function renderCapGain(g, i) {
  const gain = (parseFloat(g.proceeds)||0) - (parseFloat(g.basis)||0) + (parseFloat(g.adjustment)||0);
  return `<div class="sub-card">
    <div class="sub-card-header">
      <strong>${esc(g.description) || 'Transaction'}</strong>
      <button class="btn-remove-sm" onclick="removeItem('capitalGains',${i})">✕</button>
    </div>
    <div class="grid-2">
      ${textInput(`capitalGains[${i}].description`, g.description, 'e.g. AAPL 100 shares', 'Security Description')}
      ${selectInput(`capitalGains[${i}].term`, g.term, 'Holding Period', [['short','Short-Term (≤ 1 year)'],['long','Long-Term (> 1 year)']], 'capitalGains')}
    </div>
    <div class="grid-3">
      ${moneyInput(`capitalGains[${i}].proceeds`, g.proceeds, '0.00', 'Proceeds (Box 1d)')}
      ${moneyInput(`capitalGains[${i}].basis`, g.basis, '0.00', 'Cost Basis (Box 1e)')}
      ${moneyInput(`capitalGains[${i}].adjustment`, g.adjustment, '0.00', 'Adjustment (wash sale, etc.)')}
    </div>
    <div class="calc-preview">
      <div class="calc-row"><span>${g.term === 'long' ? 'Long-Term' : 'Short-Term'} Gain/Loss</span>
        <span class="${gain < 0 ? 'neg' : 'pos'}">${fmt(gain)}</span></div>
    </div>
  </div>`;
}

function addCapGain() {
  state.capitalGains.push({ id: uid(), description: '', term: 'long', proceeds: '', basis: '', adjustment: '' });
  renderApp();
}

// Step 6: Retirement Income
function renderStep6() {
  return `
    <div class="step-header">
      <h2>Retirement & Social Security Income</h2>
      <p class="step-desc">Include distributions from 401(k)s, IRAs, pensions (1099-R) and Social Security benefits (SSA-1099).</p>
    </div>
    <div class="card">
      <h3>Retirement Distributions (1099-R) ${helpBtn('retirementDistribution')}</h3>
      ${state.retirement.map((r, i) => renderRetirement(r, i)).join('')}
      <button class="btn-add" onclick="addRetirement()">+ Add 1099-R</button>
    </div>
    <div class="card">
      <h3>Social Security Benefits (SSA-1099) ${helpBtn('socialSecurity')}</h3>
      <p class="note">Up to 85% of your Social Security may be taxable depending on your total income. We'll calculate the exact taxable portion automatically.</p>
      <div class="grid-2">
        ${moneyInput('socialSecurity.netBenefits', state.socialSecurity.netBenefits, '0.00', 'Net SS Benefits (SSA-1099 Box 5)', 'socialSecurity')}
        ${moneyInput('socialSecurity.federalWithholding', state.socialSecurity.federalWithholding, '0.00', 'Voluntary Federal Tax Withheld (Box 6)')}
      </div>
    </div>
  `;
}

function renderRetirement(r, i) {
  const codes = [['1','1 – Early distribution, no exception (10% penalty)'],['2','2 – Early distribution, exception applies'],['3','3 – Disability'],['4','4 – Death'],['5','5 – Prohibited transaction'],['6','6 – Section 1035 exchange'],['7','7 – Normal distribution (age 59½+)'],['8','8 – Excess contributions returned'],['G','G – Direct rollover'],['H','H – Direct rollover to Roth'],['Q','Q – Qualified Roth distribution'],['T','T – Roth distribution, exception']];
  return `<div class="sub-card">
    <div class="sub-card-header">
      <strong>1099-R #${i+1} — ${esc(r.payerName) || 'Payer'}</strong>
      <button class="btn-remove-sm" onclick="removeItem('retirement',${i})">✕</button>
    </div>
    ${textInput(`retirement[${i}].payerName`, r.payerName, 'Pension/IRA custodian name', 'Payer Name')}
    <div class="grid-2">
      ${moneyInput(`retirement[${i}].grossDistribution`, r.grossDistribution, '0.00', 'Box 1 — Gross Distribution', 'retirementDistribution')}
      ${moneyInput(`retirement[${i}].taxableAmount`, r.taxableAmount, '0.00', 'Box 2a — Taxable Amount')}
    </div>
    <div class="grid-2">
      ${moneyInput(`retirement[${i}].federalWithholding`, r.federalWithholding, '0.00', 'Box 4 — Federal Tax Withheld')}
      ${selectInput(`retirement[${i}].distributionCode`, r.distributionCode || '7', 'Box 7 — Distribution Code', codes)}
    </div>
    <div class="grid-2">
      ${checkboxInput(`retirement[${i}].taxableKnown`, r.taxableKnown, 'Box 2b checked (taxable amount NOT determined — use gross)')}
      ${checkboxInput(`retirement[${i}].isIRA`, r.isIRA, 'IRA/SEP/SIMPLE (Box 7 IRA checkbox checked)')}
    </div>
    ${r.distributionCode === '1' ? `<div class="warning-card">⚠️ Distribution code 1: A 10% early withdrawal penalty applies (you must be under 59½). ${helpBtn('retirementDistribution')}</div>` : ''}
  </div>`;
}

function addRetirement() {
  state.retirement.push({ id: uid(), payerName: '', grossDistribution: '', taxableAmount: '', federalWithholding: '', distributionCode: '7', taxableKnown: false, isIRA: false });
  renderApp();
}

// Step 7: Real Estate & Other Income
function renderStep7() {
  return `
    <div class="step-header">
      <h2>Real Estate & Other Income</h2>
      <p class="step-desc">Rental properties, home sale, gambling winnings, unemployment, and more.</p>
    </div>

    <div class="card">
      <h3>Rental Income (Schedule E) ${helpBtn('rentalIncome')}</h3>
      <p class="note">Rental income is offset by expenses including depreciation (${fmt(0)} per year per $100K of building value). ${helpBtn('passiveActivity')}</p>
      ${state.rental.map((p, i) => renderRental(p, i)).join('')}
      <button class="btn-add" onclick="addRental()">+ Add Rental Property</button>
    </div>

    <div class="card">
      <h3>Home Sale (Primary Residence) ${helpBtn('homeSale')}</h3>
      <p class="note">If you sold your primary home, you may exclude up to $250,000 of gain ($500,000 MFJ) if you lived there 2 of the last 5 years.</p>
      ${checkboxInput('other.soldHome', state.other.soldHome, 'I sold my primary home in 2025')}
      ${state.other.soldHome ? `
      <div class="grid-2">
        ${moneyInput('other.homeSaleProceeds', state.other.homeSaleProceeds, '0.00', 'Selling Price')}
        ${moneyInput('other.homePurchasePrice', state.other.homePurchasePrice, '0.00', 'Original Purchase Price')}
      </div>
      <div class="grid-2">
        ${moneyInput('other.homeImprovements', state.other.homeImprovements, '0.00', 'Cost of Improvements Added')}
        ${moneyInput('other.homeSellingCosts', state.other.homeSellingCosts, '0.00', 'Selling Costs (commissions, closing costs)')}
      </div>
      ${checkboxInput('other.meetsOwnershipTest', state.other.meetsOwnershipTest, 'I owned and lived in the home for 2+ of the last 5 years (qualifies for exclusion)')}
      ${renderHomeSaleCalc()}` : ''}
    </div>

    <div class="card">
      <h3>Other Income</h3>
      <div class="grid-2">
        ${moneyInput('other.gambling', state.other.gambling, '0.00', 'Gambling Winnings (W-2G)')}
        ${moneyInput('other.unemployment', state.other.unemployment, '0.00', 'Unemployment Compensation (1099-G Box 1)')}
        ${moneyInput('other.stateRefund', state.other.stateRefund, '0.00', 'State/Local Tax Refund (1099-G)')}
        ${moneyInput('other.prizes', state.other.prizes, '0.00', 'Prizes, Awards, Other Taxable Income')}
        ${moneyInput('other.farmIncome', state.other.farmIncome, '0.00', 'Farm Income (Schedule F Net)')}
        ${moneyInput('other.otherMisc', state.other.otherMisc, '0.00', 'Other Miscellaneous Income')}
      </div>
      ${checkboxInput('other.priorYearItemized', state.other.priorYearItemized, 'I itemized deductions on my 2023 tax return (makes state refund potentially taxable)')}
      <div class="form-divider">Alimony ${helpBtn('filingStatus')}</div>
      ${checkboxInput('other.divorcePreTCJA', state.other.divorcePreTCJA, 'Divorce/separation agreement signed before January 1, 2019 (alimony is deductible/includible)')}
      ${state.other.divorcePreTCJA ? `<div class="grid-2">
        ${moneyInput('other.alimonyReceived', state.other.alimonyReceived, '0.00', 'Alimony Received (taxable income)')}
        ${moneyInput('other.alimonyPaid', state.other.alimonyPaid, '0.00', 'Alimony Paid (deductible)')}
      </div>` : `<p class="note">Post-2018 alimony: not deductible for payer, not taxable for recipient.</p>`}
      ${moneyInput('other.otherWithholding', state.other.otherWithholding, '0.00', 'Other Federal Tax Withheld (misc 1099 boxes)')}
    </div>
  `;
}

function renderHomeSaleCalc() {
  const proceeds = parseFloat(state.other.homeSaleProceeds)||0;
  const purchase = parseFloat(state.other.homePurchasePrice)||0;
  const improvements = parseFloat(state.other.homeImprovements)||0;
  const sellingCosts = parseFloat(state.other.homeSellingCosts)||0;
  const basis = purchase + improvements + sellingCosts;
  const rawGain = proceeds - basis;
  const excl = state.other.meetsOwnershipTest
    ? (state.personalInfo.filingStatus === 'mfj' ? HOME_SALE.mfj : HOME_SALE.single) : 0;
  const taxableGain = Math.max(0, rawGain - excl);
  return `<div class="calc-preview">
    <div class="calc-row"><span>Selling Price</span><span>${fmt(proceeds)}</span></div>
    <div class="calc-row"><span>Adjusted Basis</span><span>${fmt(basis)}</span></div>
    <div class="calc-row"><span>Total Gain</span><span class="${rawGain<0?'neg':'pos'}">${fmt(rawGain)}</span></div>
    ${state.other.meetsOwnershipTest ? `<div class="calc-row"><span>Section 121 Exclusion</span><span class="neg">−${fmt(excl)}</span></div>` : ''}
    <div class="calc-row highlight"><span>Taxable Gain</span><span>${fmt(taxableGain)}</span></div>
  </div>`;
}

function renderRental(p, i) {
  const rent = parseFloat(p.rent)||0;
  const depr = ((parseFloat(p.purchasePrice)||0) - (parseFloat(p.landValue)||0)) / 27.5;
  const expenses = (parseFloat(p.advertising)||0)+(parseFloat(p.insurance)||0)+(parseFloat(p.managementFees)||0)+(parseFloat(p.mortgageInterest)||0)+(parseFloat(p.repairs)||0)+(parseFloat(p.taxes)||0)+(parseFloat(p.utilities)||0)+(parseFloat(p.otherExpenses)||0)+depr;
  const net = rent - expenses;
  return `<div class="sub-card">
    <div class="sub-card-header">
      <strong>${esc(p.address) || `Property ${i+1}`}</strong>
      <button class="btn-remove-sm" onclick="removeItem('rental',${i})">✕</button>
    </div>
    ${textInput(`rental[${i}].address`, p.address, '123 Main St, City, ST', 'Property Address')}
    <div class="grid-2">
      ${moneyInput(`rental[${i}].rent`, p.rent, '0.00', 'Total Rent Received', 'rentalIncome')}
      ${moneyInput(`rental[${i}].purchasePrice`, p.purchasePrice, '0.00', 'Original Purchase Price (for depreciation)')}
    </div>
    ${moneyInput(`rental[${i}].landValue`, p.landValue, '0.00', 'Land Value (not depreciable — usually 20-30% of purchase)')}
    <details class="expense-details">
      <summary>📋 Rental Expenses</summary>
      <div class="grid-2">
        ${moneyInput(`rental[${i}].advertising`, p.advertising, '0.00', 'Advertising')}
        ${moneyInput(`rental[${i}].insurance`, p.insurance, '0.00', 'Insurance')}
        ${moneyInput(`rental[${i}].managementFees`, p.managementFees, '0.00', 'Management Fees')}
        ${moneyInput(`rental[${i}].mortgageInterest`, p.mortgageInterest, '0.00', 'Mortgage Interest')}
        ${moneyInput(`rental[${i}].repairs`, p.repairs, '0.00', 'Repairs & Maintenance')}
        ${moneyInput(`rental[${i}].taxes`, p.taxes, '0.00', 'Property Taxes')}
        ${moneyInput(`rental[${i}].utilities`, p.utilities, '0.00', 'Utilities')}
        ${moneyInput(`rental[${i}].otherExpenses`, p.otherExpenses, '0.00', 'Other Expenses')}
      </div>
    </details>
    <div class="calc-preview">
      <div class="calc-row"><span>Depreciation (auto)</span><span>${fmt(depr)}/yr</span></div>
      <div class="calc-row"><span>Total Expenses</span><span>${fmt(expenses)}</span></div>
      <div class="calc-row highlight"><span>Net Rental Income</span><span class="${net<0?'neg':'pos'}">${fmt(net)}</span></div>
      ${net < 0 ? `<div class="calc-row small"><span>Loss may be limited by passive activity rules (${helpBtn('passiveActivity')})</span></div>` : ''}
    </div>
  </div>`;
}

function addRental() {
  state.rental.push({ id: uid(), address: '', rent: '', purchasePrice: '', landValue: '', advertising: '', insurance: '', managementFees: '', mortgageInterest: '', repairs: '', taxes: '', utilities: '', otherExpenses: '' });
  renderApp();
}

// Step 8: Adjustments
function renderStep8() {
  return `
    <div class="step-header">
      <h2>Adjustments to Income (Above-the-Line Deductions) ${helpBtn('agi')}</h2>
      <p class="step-desc">These deductions reduce your Adjusted Gross Income (AGI) — which is better than itemized deductions because they apply even if you take the standard deduction.</p>
    </div>
    <div class="card">
      <div class="grid-2">
        ${moneyInput('adjustments.educatorExpenses', state.adjustments.educatorExpenses, '0.00', `Educator Expenses (max $300 — kindergarten–grade 12 teachers)`)}
        ${moneyInput('adjustments.studentLoanInterest', state.adjustments.studentLoanInterest, '0.00', 'Student Loan Interest Paid (max $2,500)', 'agi')}
        ${moneyInput('adjustments.hsaContributions', state.adjustments.hsaContributions, '0.00', 'HSA Contributions You Made (not employer)')}
        ${moneyInput('adjustments.selfEmployedHealthInsurance', state.adjustments.selfEmployedHealthInsurance, '0.00', 'Self-Employed Health Insurance Premiums')}
        ${moneyInput('adjustments.iraContribution', state.adjustments.iraContribution, '0.00', 'Traditional IRA Contribution', 'iraDeduction')}
        ${moneyInput('adjustments.retirementPlanContrib', state.adjustments.retirementPlanContrib, '0.00', 'SEP-IRA / SIMPLE / Solo 401(k) Contribution')}
        ${moneyInput('adjustments.earlyWithdrawalPenalty', state.adjustments.earlyWithdrawalPenalty, '0.00', 'Early Withdrawal Penalty on Savings Accounts')}
      </div>
      <div class="form-divider">IRA Options</div>
      ${checkboxInput('adjustments.coveredByWorkplacePlan', state.adjustments.coveredByWorkplacePlan, 'You (or your spouse) are covered by a 401(k), 403(b), or other workplace retirement plan — affects IRA deductibility')}
      ${(state.personalInfo.filingStatus === 'mfj') ?
        checkboxInput('adjustments.spouseCoveredByPlan', state.adjustments.spouseCoveredByPlan, 'Your spouse is covered by a workplace plan (but you are not)') : ''}
    </div>
    <div class="card info-card">
      <h4>Half of Self-Employment Tax</h4>
      <p>This is automatically calculated and deducted. ${helpBtn('seTax')}</p>
    </div>
  `;
}

// Step 9: Deductions
function renderStep9() {
  try {
    const res = calculateTax(state);
    const std = res.deductions.standardDeduction;
    const itm = res.deductions.totalItemized;
    const recommended = itm > std ? 'itemized' : 'standard';
    const salting = res.deductions.saltDeduction;

    return `
    <div class="step-header">
      <h2>Deductions ${helpBtn('standardDeduction')}</h2>
      <p class="step-desc">You'll use whichever is larger: the standard deduction or your itemized deductions. We recommend the <strong>${recommended}</strong> deduction for you (saves ${fmt(Math.abs(itm-std))} more).</p>
    </div>
    <div class="card deduction-compare">
      <div class="deduction-option ${recommended === 'standard' ? 'winner' : ''}">
        <div class="deduction-label">Standard Deduction ${recommended === 'standard' ? '✓ Recommended' : ''}</div>
        <div class="deduction-amount">${fmt(std)}</div>
        <div class="deduction-desc">Flat deduction for your filing status + age/blind adjustments</div>
      </div>
      <div class="deduction-vs">vs</div>
      <div class="deduction-option ${recommended === 'itemized' ? 'winner' : ''}">
        <div class="deduction-label">Itemized Deductions ${recommended === 'itemized' ? '✓ Recommended' : ''}</div>
        <div class="deduction-amount">${fmt(itm)}</div>
        <div class="deduction-desc">Sum of your actual qualifying expenses (Schedule A)</div>
      </div>
    </div>
    ${checkboxInput('deductions.forceItemized', state.deductions.forceItemized, 'Force use of itemized deductions (override recommendation)')}

    <div class="card">
      <h3>Itemized Deductions (Schedule A) ${helpBtn('itemizedDeductions')}</h3>
      <div class="form-divider">Medical & Dental Expenses</div>
      ${moneyInput('itemized.medicalExpenses', state.itemized.medicalExpenses, '0.00', 'Total Medical Expenses (only the amount exceeding 7.5% of AGI is deductible — AGI floor: ' + fmt(res.agi * 0.075) + ')')}
      <div class="calc-preview small">
        <div class="calc-row"><span>Deductible medical</span><span>${fmt(res.deductions.medicalExpenses)}</span></div>
      </div>

      <div class="form-divider">State & Local Taxes (SALT) ${helpBtn('saltCap')}</div>
      <div class="grid-3">
        ${moneyInput('itemized.stateIncomeTax', state.itemized.stateIncomeTax, '0.00', 'State Income Tax Paid')}
        ${moneyInput('itemized.localIncomeTax', state.itemized.localIncomeTax, '0.00', 'Local Income / City Tax Paid')}
        ${moneyInput('itemized.realEstateTax', state.itemized.realEstateTax, '0.00', 'Real Estate / Property Taxes')}
      </div>
      <div class="calc-preview small">
        <div class="calc-row"><span>SALT total (capped at ${fmt(res.deductions.saltCap)})</span><span>${fmt(salting)}</span></div>
      </div>

      <div class="form-divider">Home Mortgage Interest</div>
      <div class="grid-2">
        ${moneyInput('itemized.mortgageInterest', state.itemized.mortgageInterest, '0.00', 'Mortgage Interest (Form 1098 Box 1) — limited to $750K acquisition debt')}
        ${moneyInput('itemized.pointsPaid', state.itemized.pointsPaid, '0.00', 'Points Paid on Mortgage')}
      </div>

      <div class="form-divider">Charitable Contributions</div>
      <div class="grid-2">
        ${moneyInput('itemized.charitableCash', state.itemized.charitableCash, '0.00', 'Cash / Check / Card Donations')}
        ${moneyInput('itemized.charitableNonCash', state.itemized.charitableNonCash, '0.00', 'Non-Cash Donations (fair market value)')}
      </div>

      <div class="form-divider">Other</div>
      <div class="grid-2">
        ${moneyInput('itemized.investmentInterest', state.itemized.investmentInterest, '0.00', 'Investment Interest Expense')}
        ${moneyInput('itemized.gamblingLosses', state.itemized.gamblingLosses, '0.00', 'Gambling Losses (up to winnings of ' + fmt(parseFloat(state.other.gambling)||0) + ')')}
        ${moneyInput('itemized.casualtyLoss', state.itemized.casualtyLoss, '0.00', 'Casualty/Theft Loss (federally declared disaster only)')}
        ${moneyInput('itemized.other', state.itemized.other, '0.00', 'Other Itemized Deductions')}
      </div>
    </div>

    <div class="card">
      <h3>QBI Deduction (Sec. 199A) ${helpBtn('qbi')}</h3>
      <p class="note">If you have self-employment income qualifying for QBI, we automatically calculate this deduction (up to 20% of your qualified business income).</p>
      <div class="calc-preview">
        <div class="calc-row"><span>QBI Deduction</span><span>${fmt(res.qbi.deduction)}</span></div>
      </div>
    </div>
    `;
  } catch(e) {
    return `<div class="card"><p>Complete earlier steps to see deduction comparison.</p></div>`;
  }
}

// Step 10: Credits
function renderStep10() {
  return `
    <div class="step-header">
      <h2>Tax Credits ${helpBtn('childTaxCredit')}</h2>
      <p class="step-desc">Credits directly reduce your tax bill dollar-for-dollar (better than deductions). Some are refundable — meaning you get money back even if you owe $0.</p>
    </div>

    <div class="card">
      <h3>Child Tax Credit & Additional Child Tax Credit ${helpBtn('childTaxCredit')}</h3>
      <p class="note">Automatically calculated based on qualifying children entered in Step 1. Up to $2,000 per child under 17 — up to $1,700 per child may be refundable.</p>
    </div>

    <div class="card">
      <h3>Earned Income Credit (EIC) ${helpBtn('eic')}</h3>
      <p class="note">Automatically calculated. Must have earned income and meet income limits.</p>
    </div>

    <div class="card">
      <h3>Child & Dependent Care Credit ${helpBtn('eic')}</h3>
      <p class="note">For childcare costs while you work or look for work.</p>
      <div class="grid-2">
        ${moneyInput('credits.dependentCareExpenses', state.credits.dependentCareExpenses, '0.00', 'Total Qualifying Care Expenses Paid')}
        ${selectInput('credits.dependentCarePersons', state.credits.dependentCarePersons, 'Number of Qualifying Persons', [['1','1 person'],['2','2+ persons']])}
      </div>
    </div>

    <div class="card">
      <h3>Education Credits</h3>
      <div class="grid-2">
        ${moneyInput('credits.aocExpenses', state.credits.aocExpenses, '0.00', 'American Opportunity Credit — Qualified Education Expenses (first 4 years of college, max credit $2,500)')}
        ${moneyInput('credits.llcExpenses', state.credits.llcExpenses, '0.00', 'Lifetime Learning Credit — Education Expenses (any level, max credit $2,000)')}
      </div>
      <p class="note small">Only one education credit per student. AOC is worth more if eligible.</p>
    </div>

    <div class="card">
      <h3>Retirement Saver's Credit ${helpBtn('eic')}</h3>
      ${moneyInput('credits.retirementContributions', state.credits.retirementContributions, '0.00', 'Your 2025 Retirement Contributions (IRA, 401k — not employer match)')}
    </div>

    <div class="card">
      <h3>Residential Clean Energy Credit (Form 5695)</h3>
      <p class="note">30% credit for solar panels, solar water heaters, wind turbines, geothermal heat pumps, and battery storage.</p>
      <div class="grid-3">
        ${moneyInput('credits.solarInstallation', state.credits.solarInstallation, '0.00', 'Solar Installation Cost')}
        ${moneyInput('credits.windEnergy', state.credits.windEnergy, '0.00', 'Wind Energy Equipment Cost')}
        ${moneyInput('credits.batteryStorage', state.credits.batteryStorage, '0.00', 'Battery Storage Equipment Cost')}
      </div>
    </div>

    <div class="card">
      <h3>Energy Efficient Home Improvement Credit (Form 5695)</h3>
      <p class="note">30% credit, up to $1,200/year overall ($2,000 for heat pumps separately).</p>
      <div class="grid-3">
        ${moneyInput('credits.energyImprovements.windows', state.credits.energyImprovements.windows, '0.00', 'Windows & Skylights (cap $600)')}
        ${moneyInput('credits.energyImprovements.doors', state.credits.energyImprovements.doors, '0.00', 'Exterior Doors (cap $500)')}
        ${moneyInput('credits.energyImprovements.hvac', state.credits.energyImprovements.hvac, '0.00', 'Central A/C or Furnace (cap $600)')}
        ${moneyInput('credits.energyImprovements.insulation', state.credits.energyImprovements.insulation, '0.00', 'Insulation & Air Sealing (no cap)')}
        ${moneyInput('credits.energyImprovements.heatPump', state.credits.energyImprovements.heatPump, '0.00', 'Heat Pump / HP Water Heater (separate $2,000 cap)')}
        ${moneyInput('credits.energyImprovements.energyAudit', state.credits.energyImprovements.energyAudit, '0.00', 'Home Energy Audit (cap $150)')}
      </div>
    </div>

    <div class="card">
      <h3>Other Credits</h3>
      <div class="grid-2">
        ${moneyInput('credits.foreignTax', state.credits.foreignTax, '0.00', 'Foreign Tax Credit (taxes paid to foreign govt)')}
        ${moneyInput('credits.premiumTaxCredit', state.credits.premiumTaxCredit, '0.00', 'Premium Tax Credit (marketplace health insurance — Form 8962)')}
        ${moneyInput('credits.adoptionCredit', state.credits.adoptionCredit, '0.00', 'Adoption Credit (up to $15,950)')}
        ${moneyInput('credits.other', state.credits.other, '0.00', 'Other Credits (elderly, disabled, etc.)')}
      </div>
    </div>
  `;
}

// Step 11: Other Taxes & Payments
function renderStep11() {
  return `
    <div class="step-header">
      <h2>Other Taxes & Estimated Payments</h2>
      <p class="step-desc">Review automatically computed taxes and enter any estimated tax payments you've made.</p>
    </div>
    <div class="card">
      <h3>Automatically Calculated Taxes</h3>
      <p class="note">These are computed from your income. They're shown here for transparency. ${helpBtn('seTax')}</p>
      ${renderAutoTaxes()}
    </div>
    <div class="card">
      <h3>Estimated Tax Payments ${helpBtn('estimatedTax')}</h3>
      <p class="note">If you made quarterly estimated tax payments directly to the IRS, enter the total here.</p>
      ${moneyInput('payments.estimatedTax', state.payments.estimatedTax, '0.00', 'Total 2025 Estimated Tax Payments Made')}
      ${moneyInput('payments.extensionPayment', state.payments.extensionPayment, '0.00', 'Payment Made with Extension (Form 4868)')}
    </div>
  `;
}

function renderAutoTaxes() {
  try {
    const res = calculateTax(state);
    return `<div class="auto-tax-grid">
      <div class="auto-tax-item">
        <div class="auto-tax-label">Self-Employment Tax ${helpBtn('seTax')}</div>
        <div class="auto-tax-amount">${fmt(res.seTax.totalSETax)}</div>
        <div class="auto-tax-note">15.3% of ${fmt(res.seTax.netEarnings || 0)} net earnings</div>
      </div>
      <div class="auto-tax-item">
        <div class="auto-tax-label">Net Investment Income Tax ${helpBtn('niit')}</div>
        <div class="auto-tax-amount">${fmt(res.niit.tax)}</div>
        <div class="auto-tax-note">3.8% on investment income above ${fmt(res.niit.threshold || 0)}</div>
      </div>
      <div class="auto-tax-item">
        <div class="auto-tax-label">Additional Medicare Tax</div>
        <div class="auto-tax-amount">${fmt(res.addlMedicareTax.tax)}</div>
        <div class="auto-tax-note">0.9% on wages above ${fmt(res.addlMedicareTax.threshold || 0)}</div>
      </div>
      <div class="auto-tax-item">
        <div class="auto-tax-label">Alternative Minimum Tax ${helpBtn('amt')}</div>
        <div class="auto-tax-amount">${fmt(res.amtAdditional)}</div>
        <div class="auto-tax-note">AMTI: ${fmt(res.amtCalc.amti)}, Exemption: ${fmt(res.amtCalc.exemption)}</div>
      </div>
      <div class="auto-tax-item">
        <div class="auto-tax-label">Early Withdrawal Penalty</div>
        <div class="auto-tax-amount">${fmt(res.earlyWithdrawalPenalty)}</div>
        <div class="auto-tax-note">10% on retirement distributions with code "1"</div>
      </div>
    </div>`;
  } catch(e) {
    return '<p class="note">Complete earlier steps to see tax calculations.</p>';
  }
}

// Step 12: Results
function renderStep12() {
  try {
    const res = calculateTax(state);
    const isRefund = res.balance < 0;
    return `
    <div class="step-header">
      <h2>Your 2025 Tax Summary</h2>
      <p class="step-desc">Here's your complete federal income tax calculation. Review each section below.</p>
    </div>

    <div class="result-hero ${isRefund ? 'refund-hero' : 'owe-hero'}">
      <div class="result-hero-label">${isRefund ? '🎉 Estimated Refund' : '⚠️ Estimated Amount Owed'}</div>
      <div class="result-hero-amount">${fmt(Math.abs(res.balance))}</div>
      <div class="result-hero-sub">Effective Tax Rate: ${fmtPct(res.effectiveRate)} &nbsp;|&nbsp; Marginal Rate: ${fmtPct(res.marginalRate)}</div>
    </div>

    <div class="results-grid">
      <div class="card result-card">
        <h3>Income Summary</h3>
        ${resultRow('W-2 Wages', res.income.wages)}
        ${resultRow('Self-Employment Net', res.income.seNet)}
        ${resultRow('Interest', res.income.interest)}
        ${resultRow('Ordinary Dividends', res.income.ordinaryDividends)}
        ${resultRow('Short-Term Capital Gains', res.income.stcg)}
        ${resultRow('Long-Term Capital Gains', res.income.ltcg)}
        ${resultRow('Retirement Distributions', res.income.retirementTaxable)}
        ${resultRow('Taxable Social Security', res.taxableSS)}
        ${resultRow('Rental Income (Net)', res.income.rentalNet)}
        ${resultRow('Other Income', res.income.gambling + res.income.unemployment + res.income.prizes + res.income.otherMisc)}
        <div class="result-divider"></div>
        ${resultRow('Total Income', res.income.subtotal, true)}
      </div>

      <div class="card result-card">
        <h3>Adjustments & Deductions ${helpBtn('agi')}</h3>
        ${resultRow('Educator Expenses', res.adjustments.educatorExpenses, false, true)}
        ${resultRow('Student Loan Interest', res.adjustments.studentLoanInterest, false, true)}
        ${resultRow('HSA Deduction', res.adjustments.hsaDeduction, false, true)}
        ${resultRow('½ Self-Employment Tax', res.adjustments.halfSETax, false, true)}
        ${resultRow('SE Health Insurance', res.adjustments.selfEmployedHealthInsurance, false, true)}
        ${resultRow('IRA Deduction', res.adjustments.iraDeduction, false, true)}
        ${resultRow('Other Adjustments', res.adjustments.alimonyPaid + res.adjustments.earlyWithdrawalPenalty + res.adjustments.retirementPlanContrib, false, true)}
        <div class="result-divider"></div>
        ${resultRow('Adjusted Gross Income (AGI)', res.agi, true)}
        ${resultRow(res.deductions.useItemized ? 'Itemized Deductions' : 'Standard Deduction', res.deductions.deductionUsed, false, true)}
        ${resultRow('QBI Deduction (Sec. 199A)', res.qbi.deduction, false, true)}
        <div class="result-divider"></div>
        ${resultRow('Taxable Income', res.taxableIncome, true)}
      </div>

      <div class="card result-card">
        <h3>Tax Calculation</h3>
        ${resultRow('Ordinary Income Tax', res.ordinaryTax.tax)}
        ${resultRow('Long-Term Capital Gains Tax', res.ltcgTax.tax)}
        ${resultRow('AMT (Additional)', res.amtAdditional)}
        ${resultRow('Self-Employment Tax', res.seTax.totalSETax)}
        ${resultRow('Net Investment Income Tax', res.niit.tax)}
        ${resultRow('Additional Medicare Tax', res.addlMedicareTax.tax)}
        ${resultRow('Early Withdrawal Penalty', res.earlyWithdrawalPenalty)}
        <div class="result-divider"></div>
        ${resultRow('Tax Before Credits', res.taxBeforeCredits, true)}
      </div>

      <div class="card result-card">
        <h3>Credits & Payments</h3>
        ${resultRow('Child Tax Credit (non-refundable)', res.credits.ctc.nonRefundable, false, true)}
        ${resultRow('Child Tax Credit (refundable)', res.credits.ctc.refundable, false, true)}
        ${resultRow('Earned Income Credit', res.credits.eic.credit, false, true)}
        ${resultRow('Child & Dependent Care', res.credits.cdcc.credit, false, true)}
        ${resultRow('Education Credits', (res.credits.aoc?.total||0) + (res.credits.llc?.credit||0), false, true)}
        ${resultRow("Retirement Saver's Credit", res.credits.saversCredit.credit, false, true)}
        ${resultRow('Clean Energy Credits', res.credits.cleanEnergy.credit + res.credits.energyImprov.credit, false, true)}
        ${resultRow('Other Credits', res.credits.foreignTax + res.credits.ptc + res.credits.adoptionCredit + res.credits.otherCredit, false, true)}
        <div class="result-divider"></div>
        ${resultRow('Total Tax', res.totalTax, true)}
        ${resultRow('Federal Withholding (W-2s)', res.withholding.federalW2, false, true)}
        ${resultRow('Other Withholding & Payments', res.withholding.total - res.withholding.federalW2, false, true)}
        ${resultRow('Refundable Credits', res.refundableCredits, false, true)}
        <div class="result-divider"></div>
        <div class="result-row final ${isRefund ? 'refund' : 'owe'}">
          <span>${isRefund ? 'Estimated Refund' : 'Amount Owed'}</span>
          <span>${fmt(Math.abs(res.balance))}</span>
        </div>
      </div>
    </div>

    <div class="card">
      <h3>Tax Bracket Breakdown</h3>
      ${renderBracketBreakdown(res)}
    </div>

    ${renderWarnings(res)}

    <div class="card action-card">
      <h3>Next Steps</h3>
      <ul>
        <li>This calculator provides <strong>estimates only</strong> — verify with a tax professional or official IRS forms</li>
        <li>File your federal return at <strong>IRS Free File</strong> (if income ≤ $79,000) or use tax software</li>
        ${res.balance > 1000 ? '<li><strong>Avoid underpayment penalties</strong> by making quarterly estimated payments in 2026</li>' : ''}
        ${res.seTax.totalSETax > 0 ? '<li>Consider a <strong>SEP-IRA or Solo 401(k)</strong> to reduce self-employment income and taxes</li>' : ''}
        ${res.amtAdditional > 0 ? '<li>You owe AMT — consider consulting a CPA for AMT planning strategies</li>' : ''}
      </ul>
      <div class="action-buttons">
        <button class="btn-primary" onclick="window.print()">🖨️ Print / Save as PDF</button>
        <button class="btn-secondary" onclick="exportData()">💾 Export Tax Data (JSON)</button>
        <button class="btn-secondary" onclick="resetAndStart()">↺ Start Over</button>
      </div>
    </div>
    `;
  } catch(e) {
    console.error('Calculation error:', e);
    return `<div class="card error-card">
      <h3>⚠️ Calculation Error</h3>
      <p>Please review earlier steps to ensure all required fields are complete.</p>
      <p class="note">${e.message}</p>
      <button class="btn-secondary" onclick="navigateTo(1)">← Return to Step 1</button>
    </div>`;
  }
}

function resultRow(label, value, bold, isDeduc) {
  const v = parseFloat(value) || 0;
  if (v === 0 && !bold) return '';
  return `<div class="result-row ${bold ? 'bold' : ''}">
    <span>${label}</span>
    <span class="${isDeduc && v > 0 ? 'neg' : ''}">${isDeduc && v > 0 ? '−' : ''}${fmt(v)}</span>
  </div>`;
}

function renderBracketBreakdown(res) {
  if (!res.ordinaryTax.breakdown || res.ordinaryTax.breakdown.length === 0) {
    return '<p class="note">No ordinary income tax brackets to display.</p>';
  }
  const rows = res.ordinaryTax.breakdown.map(b =>
    `<tr>
      <td>${fmtPct(b.rate)}</td>
      <td>${fmt(b.lo)} – ${b.hi === Infinity ? 'above' : fmt(b.hi)}</td>
      <td>${fmt(b.taxable)}</td>
      <td>${fmt(b.tax)}</td>
    </tr>`
  ).join('');
  return `<table class="bracket-table">
    <thead><tr><th>Rate</th><th>Income Range</th><th>Amount in Bracket</th><th>Tax</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td colspan="3"><strong>Ordinary Income Tax</strong></td><td><strong>${fmt(res.ordinaryTax.tax)}</strong></td></tr></tfoot>
  </table>
  ${res.ltcgTax.breakdown && res.ltcgTax.breakdown.length > 0 ? `
  <p style="margin-top:1rem"><strong>Long-Term Capital Gains / Qualified Dividends</strong></p>
  <table class="bracket-table">
    <thead><tr><th>Rate</th><th>Range</th><th>Amount</th><th>Tax</th></tr></thead>
    <tbody>${res.ltcgTax.breakdown.map(b => `<tr>
      <td>${fmtPct(b.rate)}</td><td>Stacked position</td>
      <td>${fmt(b.taxable)}</td><td>${fmt(b.tax)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="3"><strong>LTCG Tax</strong></td><td><strong>${fmt(res.ltcgTax.tax)}</strong></td></tr></tfoot>
  </table>` : ''}`;
}

function renderWarnings(res) {
  const warnings = [];
  if (res.amtAdditional > 0) warnings.push({ type: 'warn', msg: `You owe ${fmt(res.amtAdditional)} in Alternative Minimum Tax (AMT). This means your regular tax was lower than the AMT calculation. ${helpBtn('amt')}` });
  if (res.niit.tax > 0) warnings.push({ type: 'info', msg: `Net Investment Income Tax (NIIT) of ${fmt(res.niit.tax)} applies because your income exceeds the threshold. ${helpBtn('niit')}` });
  if (res.balance > 1000) warnings.push({ type: 'warn', msg: `You owe ${fmt(res.balance)}. To avoid a future penalty, consider increasing withholding on your W-4 or making quarterly estimated payments. ${helpBtn('estimatedTax')}` });
  if (res.seTax.totalSETax > 5000) warnings.push({ type: 'info', msg: `Your self-employment tax is ${fmt(res.seTax.totalSETax)}. A SEP-IRA or Solo 401(k) contribution can significantly reduce this. Consult a tax professional.` });
  if (warnings.length === 0) return '';
  return `<div class="card"><h3>📌 Important Notes</h3>
    ${warnings.map(w => `<div class="alert-${w.type}">${w.msg}</div>`).join('')}
  </div>`;
}

// ── Global operations ─────────────────────────────────────────
function removeItem(section, index) {
  state[section].splice(index, 1);
  renderApp();
}

function exportData() {
  const blob = new Blob([JSON.stringify({ taxYear: 2025, state, result: calculateTax(state) }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'tax-data-2025.json';
  a.click();
}

function resetAndStart() {
  if (confirm('Are you sure you want to start over? All entered data will be lost.')) {
    state = createInitialState();
    currentStep = 1;
    renderApp();
  }
}

// ── OCR Handlers ──────────────────────────────────────────────
function handleFileDrop(event) {
  event.preventDefault();
  const files = Array.from(event.dataTransfer.files);
  processFiles(files);
}

function handleFileSelect(event) {
  const files = Array.from(event.target.files);
  processFiles(files);
}

async function processFiles(files) {
  const results = $('ocr-results');
  const progressEl = $('ocr-progress');
  const fill = $('ocr-fill');
  const statusEl = $('ocr-status');
  results.innerHTML = '';
  progressEl.style.display = 'block';

  for (const file of files) {
    try {
      statusEl.textContent = `Processing ${file.name}...`;
      const ocrResult = await OCRModule.processImage(file, (pct, msg) => {
        fill.style.width = pct + '%';
        statusEl.textContent = msg;
      });
      const mapped = OCRModule.mapToAppState(ocrResult, state);
      renderOCRResult(ocrResult, mapped, results);
    } catch(err) {
      results.innerHTML += `<div class="ocr-error">❌ Error processing ${file.name}: ${err.message}</div>`;
    }
  }
  progressEl.style.display = 'none';
}

function renderOCRResult(ocrResult, mapped, container) {
  const { formType, fields, confidence } = ocrResult;
  const confClass = confidence > 80 ? 'high' : confidence > 60 ? 'medium' : 'low';
  let html = `<div class="ocr-result-card">
    <div class="ocr-result-header">
      <span class="form-type-badge">${formType.toUpperCase()}</span>
      <span class="confidence ${confClass}">Confidence: ${Math.round(confidence)}%</span>
    </div>`;

  if (Object.keys(fields).length > 0) {
    html += '<div class="ocr-fields">';
    for (const [key, val] of Object.entries(fields)) {
      html += `<div class="ocr-field"><span class="ocr-key">${key}:</span> <span class="ocr-val">${val}</span></div>`;
    }
    html += '</div>';
    if (mapped.length > 0) {
      html += `<button class="btn-primary" onclick="applyOCRData(${JSON.stringify(mapped).replace(/"/g,'&quot;')})">✓ Apply Extracted Data</button>`;
    }
  } else {
    html += '<p class="note">Could not extract structured data. Please enter values manually.</p>';
  }
  html += '</div>';
  container.innerHTML += html;
}

function applyOCRData(mappedEntries) {
  for (const entry of mappedEntries) {
    switch (entry.type) {
      case 'w2':         state.w2.push({ id: uid(), ...entry.data }); break;
      case 'interest':   state.interest.push({ id: uid(), ...entry.data }); break;
      case 'dividend':   state.dividends.push({ id: uid(), ...entry.data }); break;
      case 'selfEmployment': state.selfEmployment.push({ id: uid(), ...entry.data }); break;
      case 'retirement': state.retirement.push({ id: uid(), ...entry.data }); break;
      case 'socialSecurity': state.socialSecurity = { ...state.socialSecurity, ...entry.data }; break;
    }
  }
  renderApp();
  alert('Data applied! Review in the appropriate income sections.');
}

// ── Main Render ───────────────────────────────────────────────
function renderApp() {
  const stepRenderers = [null, renderStep1, renderStep2, renderStep3, renderStep4,
    renderStep5, renderStep6, renderStep7, renderStep8, renderStep9,
    renderStep10, renderStep11, renderStep12];

  const content = $('step-content');
  content.innerHTML = stepRenderers[currentStep]();

  renderProgress();
  renderLiveSummary();

  // Scroll to top of content
  content.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  renderApp();
  $('help-modal').addEventListener('click', (e) => {
    if (e.target === $('help-modal')) closeHelp();
  });
});

// Expose globally
window.navigateTo = navigateTo;
window.nextStep = nextStep;
window.prevStep = prevStep;
window.showHelp = showHelp;
window.closeHelp = closeHelp;
window.handleInput = handleInput;
window.addW2 = addW2;
window.addSelfEmployment = addSelfEmployment;
window.addInterest = addInterest;
window.addDividend = addDividend;
window.addCapGain = addCapGain;
window.addRetirement = addRetirement;
window.addRental = addRental;
window.addDependent = addDependent;
window.removeDependent = removeDependent;
window.removeItem = removeItem;
window.exportData = exportData;
window.resetAndStart = resetAndStart;
window.handleFileDrop = handleFileDrop;
window.handleFileSelect = handleFileSelect;
window.applyOCRData = applyOCRData;
