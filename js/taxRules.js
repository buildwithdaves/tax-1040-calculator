'use strict';
// ============================================================
//  IRS TAX RULES — TAX YEAR 2024
//  All values sourced from IRS Rev. Proc. 2023-34 and related
//  publications. No external API calls required at runtime.
// ============================================================

const TAX_YEAR = 2024;

// ── Standard Deductions ──────────────────────────────────────
const STANDARD_DEDUCTION = {
  single:  14600,
  mfj:     29200,
  mfs:     14600,
  hoh:     21900,
  qss:     29200
};

// Additional std deduction per box (age 65+ OR blind)
const ADDITIONAL_STD_DEDUCTION = {
  single_hoh:  1950,  // each qualifying condition
  other:       1550   // each qualifying condition (MFJ, MFS, QSS)
};

// ── Ordinary Income Tax Brackets ────────────────────────────
// Each row: [lowerBound, upperBound, rate]
const ORDINARY_BRACKETS = {
  single: [
    [0,       11600,    0.10],
    [11600,   47150,    0.12],
    [47150,   100525,   0.22],
    [100525,  191950,   0.24],
    [191950,  243725,   0.32],
    [243725,  609350,   0.35],
    [609350,  Infinity, 0.37]
  ],
  mfj: [
    [0,       23200,    0.10],
    [23200,   94300,    0.12],
    [94300,   201050,   0.22],
    [201050,  383900,   0.24],
    [383900,  487450,   0.32],
    [487450,  731200,   0.35],
    [731200,  Infinity, 0.37]
  ],
  mfs: [
    [0,       11600,    0.10],
    [11600,   47150,    0.12],
    [47150,   100525,   0.22],
    [100525,  191950,   0.24],
    [191950,  243725,   0.32],
    [243725,  365600,   0.35],
    [365600,  Infinity, 0.37]
  ],
  hoh: [
    [0,       16550,    0.10],
    [16550,   63100,    0.12],
    [63100,   100500,   0.22],
    [100500,  191950,   0.24],
    [191950,  243700,   0.32],
    [243700,  609350,   0.35],
    [609350,  Infinity, 0.37]
  ],
  qss: [ // same as MFJ
    [0,       23200,    0.10],
    [23200,   94300,    0.12],
    [94300,   201050,   0.22],
    [201050,  383900,   0.24],
    [383900,  487450,   0.32],
    [487450,  731200,   0.35],
    [731200,  Infinity, 0.37]
  ]
};

// ── Long-Term Capital Gains / Qualified Dividends Brackets ──
const LTCG_BRACKETS = {
  single: [
    [0,       47025,    0.00],
    [47025,   518900,   0.15],
    [518900,  Infinity, 0.20]
  ],
  mfj: [
    [0,       94050,    0.00],
    [94050,   583750,   0.15],
    [583750,  Infinity, 0.20]
  ],
  mfs: [
    [0,       47025,    0.00],
    [47025,   291850,   0.15],
    [291850,  Infinity, 0.20]
  ],
  hoh: [
    [0,       63000,    0.00],
    [63000,   551350,   0.15],
    [551350,  Infinity, 0.20]
  ],
  qss: [
    [0,       94050,    0.00],
    [94050,   583750,   0.15],
    [583750,  Infinity, 0.20]
  ]
};

// ── Self-Employment Tax ──────────────────────────────────────
const SE_TAX = {
  ssRate:               0.124,
  medicareRate:         0.029,
  ssCap:                168600,   // SS wage base 2024
  addlMedicareRate:     0.009,
  addlMedicareThreshold: {
    single: 200000, mfj: 250000, mfs: 125000, hoh: 200000, qss: 250000
  }
};

// ── Net Investment Income Tax (NIIT, Form 8960) ─────────────
const NIIT = {
  rate: 0.038,
  threshold: {
    single: 200000, mfj: 250000, mfs: 125000, hoh: 200000, qss: 250000
  }
};

// ── Alternative Minimum Tax (AMT) ───────────────────────────
const AMT = {
  exemption: {
    single: 85700, mfj: 133300, mfs: 66650, hoh: 85700, qss: 133300
  },
  phaseoutStart: {
    single: 609350, mfj: 1218700, mfs: 609350, hoh: 609350, qss: 1218700
  },
  rate1: 0.26,
  rate2: 0.28,
  breakpoint: 220700  // income above which 28% applies (not filing-status-adjusted)
};

// ── Child Tax Credit (CTC) ───────────────────────────────────
const CTC = {
  perQualifyingChild:   2000,
  perOtherDependent:    500,
  phaseoutStart: {
    single: 200000, mfj: 400000, mfs: 200000, hoh: 200000, qss: 400000
  },
  phaseoutPer1000:      50,    // $50 reduction per $1,000 over threshold
  maxRefundable:        1700,  // Additional CTC
  refundableRate:       0.15,
  earningsFloor:        2500   // must have > $2,500 earned income for ACTC
};

// ── Earned Income Credit (EIC/EITC) ─────────────────────────
// Algorithmic approximation; actual IRS uses interpolated tables
const EIC = {
  // Maximum investment income allowed
  maxInvestmentIncome: 11600,
  maxAge:              { noChildren: { min: 25, max: 64 } },  // without children
  data: {
    // [children]: { maxCredit, phaseInRate, phaseInEnd, plateauEnd_single, plateauEnd_mfj, phaseOutRate, maxIncome_single, maxIncome_mfj }
    0: { maxCredit: 632,  phaseInRate: 0.0765, phaseInEnd: 8260,  plateauEnd: { single: 9524,  mfj: 16370 }, phaseOutRate: 0.0765, maxIncome: { single: 18591, mfj: 25511 } },
    1: { maxCredit: 4213, phaseInRate: 0.3400, phaseInEnd: 11610, plateauEnd: { single: 21560, mfj: 21560 }, phaseOutRate: 0.1598, maxIncome: { single: 49084, mfj: 56004 } },
    2: { maxCredit: 6960, phaseInRate: 0.4000, phaseInEnd: 14590, plateauEnd: { single: 21560, mfj: 21560 }, phaseOutRate: 0.2106, maxIncome: { single: 55768, mfj: 62688 } },
    3: { maxCredit: 7830, phaseInRate: 0.4500, phaseInEnd: 14590, plateauEnd: { single: 21560, mfj: 21560 }, phaseOutRate: 0.2106, maxIncome: { single: 59899, mfj: 66819 } }
  }
};

// ── IRA Limits ───────────────────────────────────────────────
const IRA = {
  contribution: { under50: 7000, over50: 8000 },
  // Traditional IRA deductibility phaseout (if covered by workplace plan)
  traditionalPhaseout: {
    covered: {
      single: { start: 77000,  end: 87000 },
      mfj:    { start: 123000, end: 143000 },
      mfs:    { start: 0,      end: 10000  },
      hoh:    { start: 77000,  end: 87000  }
    },
    // Spouse covered but taxpayer is not
    spouseCovered: {
      mfj:    { start: 230000, end: 240000 }
    }
  },
  // Roth IRA contribution phaseout
  rothPhaseout: {
    single: { start: 146000, end: 161000 },
    mfj:    { start: 230000, end: 240000 },
    mfs:    { start: 0,      end: 10000  },
    hoh:    { start: 146000, end: 161000 },
    qss:    { start: 230000, end: 240000 }
  }
};

// ── Health Savings Account (HSA) ─────────────────────────────
const HSA = {
  selfOnly:        4150,
  family:          8300,
  additionalAge55: 1000
};

// ── Qualified Business Income Deduction (Sec. 199A) ─────────
const QBI = {
  rate: 0.20,
  phaseoutStart: {
    single: 191950, mfj: 383900, mfs: 191950, hoh: 191950, qss: 383900
  },
  phaseoutEnd: {
    single: 241950, mfj: 483900, mfs: 241950, hoh: 241950, qss: 483900
  }
};

// ── Student Loan Interest Deduction ─────────────────────────
const STUDENT_LOAN = {
  maxDeduction: 2500,
  phaseout: {
    single: { start: 80000,  end: 95000  },
    mfj:    { start: 165000, end: 195000 },
    hoh:    { start: 80000,  end: 95000  }
    // MFS: not eligible
  }
};

// ── SALT Cap ─────────────────────────────────────────────────
const SALT_CAP = { normal: 10000, mfs: 5000 };

// ── Child & Dependent Care Credit ───────────────────────────
const CDCC = {
  maxExpenses:    { one: 3000, twoPlus: 6000 },
  baseRate:       0.20,
  maxRate:        0.35,
  phasedownStart: 15000,
  phasedownPer2000: 0.01  // 1% reduction per $2,000 AGI over $15,000
};

// ── American Opportunity Credit (AOC) ───────────────────────
const AOC = {
  maxCredit:         2500,
  refundablePercent: 0.40,
  qualifiedExpenses: 4000,
  creditRate1:       1.00,  // 100% of first $2,000
  creditRate2:       0.25,  // 25% of next $2,000
  phaseout: {
    single: { start: 80000,  end: 90000  },
    mfj:    { start: 160000, end: 180000 }
  }
};

// ── Lifetime Learning Credit (LLC) ──────────────────────────
const LLC_CREDIT = {
  rate:         0.20,
  maxExpenses:  10000,
  maxCredit:    2000,
  phaseout: {
    single: { start: 80000,  end: 90000  },
    mfj:    { start: 160000, end: 180000 }
  }
};

// ── Retirement Saver's Credit (Form 8880) ───────────────────
const SAVERS_CREDIT = {
  maxContribution: 2000,
  // [maxAGI, rate] — use highest applicable rate
  brackets: {
    single: [
      [22500,    0.50],
      [24500,    0.34],
      [37500,    0.10],
      [Infinity, 0.00]
    ],
    mfj: [
      [45000,    0.50],
      [49000,    0.34],
      [75000,    0.10],
      [Infinity, 0.00]
    ],
    hoh: [
      [33750,    0.50],
      [36750,    0.34],
      [56250,    0.10],
      [Infinity, 0.00]
    ],
    mfs: [
      [22500,    0.50],
      [24500,    0.34],
      [37500,    0.10],
      [Infinity, 0.00]
    ],
    qss: [
      [45000,    0.50],
      [49000,    0.34],
      [75000,    0.10],
      [Infinity, 0.00]
    ]
  }
};

// ── Social Security Benefit Taxability ──────────────────────
const SS_COMBINED_INCOME = {
  // combined income = AGI + nontaxable interest + 50% of SS benefits
  single_hoh: { t1: 25000, t2: 34000 },
  mfj:        { t1: 32000, t2: 44000 },
  mfs_livedTogether: { alwaysUpTo85: true }  // lived with spouse: always up to 85%
};

// ── Section 121 Home Sale Exclusion ─────────────────────────
const HOME_SALE = {
  single: 250000,
  mfj:    500000
};

// ── Residential Clean Energy Credit (Form 5695 Pt. I) ───────
const CLEAN_ENERGY_CREDIT = {
  rate: 0.30
  // No dollar cap for 2024; unlimited for solar, wind, geothermal, battery
};

// ── Energy Efficient Home Improvement Credit (Form 5695 Pt. II) ─
const ENERGY_IMPROVEMENT_CREDIT = {
  annualCap:   1200,  // overall cap (excluding heat pumps)
  heatPumpCap: 2000,  // separate cap for heat pumps / heat pump water heaters
  items: {
    windows:     { rate: 0.30, cap: 600  },
    doors:       { rate: 0.30, cap: 500  },  // $250 per door, 2 max
    roofing:     { rate: 0.30, cap: 600  },
    hvac:        { rate: 0.30, cap: 600  },
    insulation:  { rate: 0.30, noCap: true },
    heatPump:    { rate: 0.30, cap: 2000 },  // uses separate $2,000 limit
    waterHeater: { rate: 0.30, cap: 600  },
    energyAudit: { rate: 0.30, cap: 150  }
  }
};

// ── 401(k) / Retirement Plan Limits (W-2 Box 12) ────────────
const RETIREMENT_PLAN_LIMITS = {
  '401k':    { under50: 23000, over50: 30500 },
  '403b':    { under50: 23000, over50: 30500 },
  'SIMPLE':  { under50: 16000, over50: 19500 },
  'SEP':     { rate: 0.25, max: 69000 },       // 25% of comp, capped
  'SOLO401k':{ under50: 23000, over50: 30500 } // employee contribution
};

// ── Early Withdrawal Penalty ─────────────────────────────────
const EARLY_WITHDRAWAL = {
  penaltyRate: 0.10,
  // Distribution codes that ARE subject to penalty (IRS Form 1099-R Box 7)
  penaltyCodes: ['1'],
  // Distribution codes exempt from penalty
  exemptCodes: ['2','3','4','5','6','7','8','9','A','B','C','D','E','F','G','H','J','K','L','M','N','P','Q','R','S','T','U','W']
};

// ── Educator Expense Deduction ───────────────────────────────
const EDUCATOR = { max: 300, maxEach: 300 };

// ── Alimony Rules ────────────────────────────────────────────
const ALIMONY = {
  // Post-TCJA (divorce after 12/31/2018): alimony NOT deductible/includible
  // Pre-TCJA (divorce before 1/1/2019): alimony IS deductible paid / includible received
  tcjaCutoff: new Date('2019-01-01')
};

// ── Premium Tax Credit (ACA, Form 8962) ─────────────────────
// Simplified — actual calculation requires FPL lookup table and 1095-A
const PTC = {
  // Income range: 100%–400% FPL (no upper limit through 2025 per Inflation Reduction Act)
  // Actual credit computed on Form 8962 comparing benchmark premium to cap %
  note: 'Requires Form 1095-A from marketplace. Credit phased down based on income relative to FPL.'
};

// ── Foreign Tax Credit ───────────────────────────────────────
const FOREIGN_TAX = {
  simpleLimit: 300,  // $300 single / $600 MFJ — can claim on Sch. B without Form 1116
  simpleLimit_mfj: 600
};

// ── Depreciation for Rental Property ────────────────────────
const DEPRECIATION = {
  residentialLifeYears: 27.5,
  commercialLifeYears:  39,
  method: 'MACRS Straight-Line'
};

// ── Passive Activity Loss (PAL) Rules ───────────────────────
const PASSIVE_ACTIVITY = {
  rentalRealEstateAllowance: 25000,  // special $25K allowance for active participation
  phaseoutStart: 100000,
  phaseoutEnd:   150000
};

// Help text for every major concept (shown when user clicks ?)
const HELP_TEXT = {
  filingStatus: `Your filing status determines your tax brackets, standard deduction, and eligibility for certain credits.
• Single – unmarried or legally separated
• Married Filing Jointly (MFJ) – married and filing one return together (usually lowest tax)
• Married Filing Separately (MFS) – married but filing separate returns (rarely beneficial)
• Head of Household (HOH) – unmarried AND paid more than half the cost of a home for a qualifying person
• Qualifying Surviving Spouse (QSS) – widowed in prior 2 years with a dependent child`,

  w2Box1: `Box 1 of your W-2 is your total taxable wages from this employer. It includes your salary, tips, bonuses, and other compensation. It does NOT include 401(k) contributions (Box 12 code D) or HSA contributions (Box 12 code W) because those reduce your taxable wages before Box 1 is calculated.`,

  w2Box2: `The federal income tax your employer withheld from your paychecks throughout the year. This is a direct payment toward your tax bill — it reduces (or eliminates) what you owe, or increases your refund.`,

  selfEmploymentIncome: `If you received a 1099-NEC or 1099-MISC (box 3) for freelance, consulting, gig work, or any business income, it goes here. You pay both the employee AND employer portions of Social Security and Medicare tax (15.3% on net earnings), known as Self-Employment (SE) Tax. However, you can deduct half of SE tax from your income.`,

  capitalGains: `Profit from selling an investment.
• Short-term: Held 1 year or less — taxed at ordinary income rates (10–37%)
• Long-term: Held more than 1 year — taxed at preferential rates (0%, 15%, or 20%)
Your cost basis is what you paid for it. Gain = Proceeds − Cost Basis − Commissions.`,

  qualifiedDividends: `Dividends that meet IRS requirements are "qualified" and taxed at the lower long-term capital gains rates (0–20%) instead of ordinary income rates. Most dividends from U.S. corporations held for the required holding period qualify.`,

  standardDeduction: `A flat dollar amount that reduces your taxable income. For 2024: $14,600 (Single), $29,200 (MFJ), $21,900 (HOH). You choose the HIGHER of your standard deduction or your itemized deductions. Most taxpayers use the standard deduction because it's larger.`,

  itemizedDeductions: `Instead of the standard deduction, you can list actual deductible expenses on Schedule A. Common items: mortgage interest, state/local taxes (capped at $10,000), charitable donations, and large medical expenses. Only worthwhile if your total exceeds the standard deduction.`,

  saltCap: `The Tax Cuts and Jobs Act of 2017 capped the deduction for State and Local Taxes (SALT) — including state income/sales taxes AND property taxes — at $10,000 per return ($5,000 if MFS). This is one of the most impactful changes for high-tax-state residents.`,

  qbi: `The Qualified Business Income (QBI) deduction lets eligible self-employed people and pass-through business owners deduct up to 20% of their qualified business income. It phases out for higher incomes and has restrictions for certain "specified service trades or businesses" (like law, health, consulting). This can significantly reduce your tax bill.`,

  agi: `Adjusted Gross Income (AGI) = Total Income minus "above-the-line" deductions (like SE tax deduction, IRA contributions, student loan interest). AGI is important because many deductions, credits, and phase-outs are calculated based on your AGI.`,

  childTaxCredit: `Up to $2,000 per qualifying child under age 17. A qualifying child must: live with you more than half the year, be related to you, have a Social Security number, and not provide more than half their own support. Up to $1,700 per child may be refundable (you get it even if you owe no tax) through the Additional Child Tax Credit.`,

  eic: `The Earned Income Credit (EIC or EITC) is a refundable credit for low-to-moderate income workers. "Refundable" means you get money back even if you owe no tax. The amount depends on your income, filing status, and number of qualifying children. It's one of the largest anti-poverty programs in the U.S. tax code.`,

  seTax: `Self-Employment (SE) Tax = 15.3% of 92.35% of your net self-employment income (the reduction is because employees only pay 7.65% and can deduct the other half). You pay this in addition to regular income tax. You can deduct half of SE tax as an above-the-line adjustment, which reduces your AGI.`,

  niit: `The Net Investment Income Tax (NIIT) is an additional 3.8% tax on investment income (interest, dividends, capital gains, rental income) when your Modified AGI exceeds $200,000 (single) or $250,000 (MFJ). It was created by the Affordable Care Act to fund Medicare.`,

  amt: `The Alternative Minimum Tax (AMT) is a parallel tax system that limits the benefit of certain deductions. You calculate your tax both ways and pay whichever is higher. It primarily affects people with high incomes who have many deductions. The AMT exemption of $85,700 (single) / $133,300 (MFJ) means most middle-income taxpayers are not affected.`,

  socialSecurity: `Up to 85% of your Social Security benefits may be taxable depending on your "combined income" (AGI + nontaxable interest + 50% of SS benefits). If your combined income is under $25,000 (single) or $32,000 (MFJ), none is taxable.`,

  rentalIncome: `Rental income from real property is reported on Schedule E. You can deduct expenses like mortgage interest, property taxes, insurance, repairs, property management fees, and depreciation. Depreciation spreads the cost of the building over 27.5 years and can significantly reduce taxable rental income.`,

  passiveActivity: `Rental activities are generally "passive," meaning losses can only offset passive income — NOT your wages or self-employment income. Exception: if you "actively participate" in rental management AND your AGI is under $100,000, you can deduct up to $25,000 of rental losses against non-passive income. This allowance phases out between $100,000–$150,000 AGI.`,

  homeSale: `When you sell your primary home, you can exclude up to $250,000 of gain ($500,000 MFJ) if you owned AND lived in the home as your principal residence for at least 2 of the last 5 years. Gain = Selling price − Original purchase price − Cost of improvements − Selling expenses.`,

  washSale: `A wash sale occurs when you sell a security at a loss and buy the same or substantially identical security within 30 days before or after the sale. The IRS disallows this loss — you cannot use it to offset gains. The disallowed loss is added to the cost basis of the replacement shares.`,

  retirementDistribution: `Distributions from traditional 401(k)s, IRAs, and pensions are generally fully taxable as ordinary income. If you take money out before age 59½, you also owe a 10% early withdrawal penalty (Box 7 code "1" on your 1099-R), with some exceptions (disability, substantially equal payments, etc.).`,

  iraDeduction: `Contributions to a traditional IRA may be tax-deductible, reducing your current income. Deductibility depends on your income and whether you (or your spouse) are covered by a workplace retirement plan. The deduction phases out at higher incomes. Roth IRA contributions are never deductible, but qualified withdrawals are tax-free.`,

  estimatedTax: `If you have income not subject to withholding (self-employment, investments, rental income), you may need to make quarterly estimated tax payments to avoid an underpayment penalty. Payments are due April 15, June 17, September 16, and January 15.`,

  effectiveRate: `Your effective (average) tax rate = Total Tax ÷ Total Income. This is your real overall tax burden as a percentage. It's different from your marginal rate, which is the rate on your LAST dollar of income. Most people's effective rate is lower than their marginal rate because lower income portions are taxed at lower rates.`
};

// Export all rules
if (typeof module !== 'undefined') {
  module.exports = {
    TAX_YEAR, STANDARD_DEDUCTION, ADDITIONAL_STD_DEDUCTION,
    ORDINARY_BRACKETS, LTCG_BRACKETS, SE_TAX, NIIT, AMT,
    CTC, EIC, IRA, HSA, QBI, STUDENT_LOAN, SALT_CAP, CDCC,
    AOC, LLC_CREDIT, SAVERS_CREDIT, SS_COMBINED_INCOME,
    HOME_SALE, CLEAN_ENERGY_CREDIT, ENERGY_IMPROVEMENT_CREDIT,
    RETIREMENT_PLAN_LIMITS, EARLY_WITHDRAWAL, EDUCATOR, ALIMONY,
    PTC, FOREIGN_TAX, DEPRECIATION, PASSIVE_ACTIVITY, HELP_TEXT
  };
}
