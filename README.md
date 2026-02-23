# 📋 1040 Tax Calculator — Tax Year 2024

A **free, comprehensive, privacy-first** federal income tax calculator for Form 1040. All calculations run 100% in your browser — no data is ever sent to a server.

🔗 **[Live Demo →](https://buildwithdaves.github.io/tax-1040-calculator)**

---

## ✨ Features

### Complete Income Coverage
| Form | Income Type |
|------|------------|
| W-2 | Wages, salary, tips |
| 1099-NEC | Freelance, consulting, gig work |
| 1099-MISC | Other miscellaneous income |
| 1099-INT | Bank interest |
| 1099-DIV | Dividends (ordinary + qualified) |
| 1099-B | Capital gains / losses (Schedule D) |
| 1099-R | Retirement distributions (401k, IRA, pension) |
| SSA-1099 | Social Security benefits |
| 1099-K | Payment processors (Venmo, PayPal, Stripe) |
| 1099-G | Unemployment, state tax refunds |
| Schedule E | Rental income with depreciation |
| Schedule K-1 | Partnership / S-Corp pass-through income |
| Form W-2G | Gambling winnings |
| — | Farm income, alimony, prizes, and more |

### Smart Deductions & Credits
- **Standard vs. Itemized comparison** — automatically recommends the better option
- **Schedule A** — SALT cap, mortgage interest, charitable contributions, medical expenses
- **QBI Deduction (Sec. 199A)** — 20% deduction for self-employed
- **Child Tax Credit** — up to $2,000/child + refundable ACTC
- **Earned Income Credit** — algorithmic calculation
- **Education Credits** — American Opportunity + Lifetime Learning
- **Clean Energy Credits** — solar, heat pumps, insulation, etc.
- **Retirement Saver's Credit, CDCC, Foreign Tax Credit**, and more

### Smart Tax Calculations
- Ordinary income tax brackets with bracket breakdown table
- Preferential rates for qualified dividends & long-term capital gains
- Self-employment tax (Schedule SE)
- Net Investment Income Tax (Form 8960)
- Additional Medicare Tax (Form 8959)
- Alternative Minimum Tax (Form 6251)
- Early withdrawal penalties (Form 5329)
- Social Security benefit taxability

### Photo OCR — Scan Your Tax Forms
Upload a photo or scan of your W-2, 1099, or other tax document and the calculator automatically reads and fills in the values using [Tesseract.js](https://tesseract.projectnaptha.com/).

### Built-In Explanations
Every field has a **?** button with a plain-English explanation of:
- What the field means
- How it affects your taxes
- Relevant IRS rules

---

## 🚀 Getting Started

### Option 1: Use Online (Recommended)
Visit the [live demo](https://buildwithdaves.github.io/tax-1040-calculator) — no installation required.

### Option 2: Run Locally
```bash
git clone https://github.com/YOUR_USERNAME/tax-1040-calculator.git
cd tax-1040-calculator
# Open in browser:
open index.html          # macOS
start index.html         # Windows
xdg-open index.html      # Linux
```

No build step, no dependencies to install — it's pure HTML/CSS/JavaScript.

---

## 📁 Project Structure

```
tax-1040-calculator/
├── index.html          # App shell & layout
├── css/
│   └── styles.css      # All UI styles
├── js/
│   ├── taxRules.js     # All 2024 IRS tax constants & rules
│   ├── calculator.js   # Pure calculation engine
│   ├── ocr.js          # OCR document scanning (Tesseract.js)
│   └── app.js          # UI rendering & state management
└── README.md
```

---

## 🔒 Privacy

**Your data never leaves your browser.** All tax calculations and OCR processing happen locally. Nothing is sent to any server. You can run this completely offline after the initial page load (except for OCR, which requires Tesseract.js from CDN).

---

## 📊 2024 Tax Rules Included

All rules are baked into `js/taxRules.js`. No internet connection needed to calculate:

- **Tax brackets** for all 5 filing statuses
- **Long-term capital gains rates** (0%, 15%, 20%)
- **Standard deductions** ($14,600 / $29,200 / $21,900)
- **SE Tax** — SS wage base ($168,600), rates
- **NIIT** — 3.8% threshold ($200K / $250K)
- **AMT** — exemptions, phase-outs
- **CTC/ACTC** — phase-outs, refundable portion
- **EIC** — algorithmic calculation for 0–3+ children
- **IRA / HSA / 401(k)** — contribution limits
- **QBI** — phase-out ranges
- **Home sale exclusion** — Section 121 ($250K / $500K)
- And 30+ more rules

---

## ⚠️ Disclaimer

This calculator provides **estimates for informational purposes only**. It does not constitute tax advice. Tax situations vary — consult a licensed CPA or tax attorney for your specific situation. Always verify results against official IRS forms and publications.

---

## 📄 License

MIT License — free to use, modify, and distribute.

---

## 🤝 Contributing

Contributions welcome! Please open an issue first for major changes.

- **Found a bug?** Open an issue with your income scenario
- **Wrong tax rule?** Please cite the IRS source (Rev. Proc., Publication, etc.)
- **Want to add a state?** Create a `js/stateRules/` directory

---

*Built with ❤️ for taxpayers who deserve to understand their own taxes.*
