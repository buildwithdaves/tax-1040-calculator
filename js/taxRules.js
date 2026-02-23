'use strict';
// ============================================================
//  IRS TAX RULES — TAX YEAR 2025
//  Sources: IRS Rev. Proc. 2024-40, IR-2024-273
//  Brackets confirmed at irs.gov/filing/federal-income-tax-rates-and-brackets
//  EIC confirmed at irs.gov EITC tables
//  No external API calls required at runtime.
// ============================================================

const TAX_YEAR = 2025;

// ── Standard Deductions ──────────────────────────────────────
const STANDARD_DEDUCTION = {
  single:  15000,
  mfj:     30000,
  mfs:     15000,
  hoh:     22500,
  qss:     30000
};

// Additional std deduction per box (age 65+ OR blind)
const ADDITIONAL_STD_DEDUCTION = {
  single_hoh:  2000,  // each qualifying condition
  other:       1600   // each qualifying condition (MFJ, MFS, QSS)
};

// ── Ordinary Income Tax Brackets ────────────────────────────
// Each row: [lowerBound, upperBound, rate]
// Source: IRS Rev. Proc. 2024-40 / IR-2024-273
const ORDINARY_BRACKETS = {
  single: [
    [0,       11925,    0.10],
    [11925,   48475,    0.12],
    [48475,   103350,   0.22],
    [103350,  197300,   0.24],
    [197300,  250525,   0.32],
    [250525,  626350,   0.35],
    [626350,  Infinity, 0.37]
  ],
  mfj: [
    [0,       23850,    0.10],
    [23850,   96950,    0.12],
    [96950,   206700,   0.22],
    [206700,  394600,   0.24],
    [394600,  501050,   0.32],
    [501050,  751600,   0.35],
    [751600,  Infinity, 0.37]
  ],
  mfs: [
    [0,       11925,    0.10],
    [11925,   48475,    0.12],
    [48475,   103350,   0.22],
    [103350,  197300,   0.24],
    [197300,  250525,   0.32],
    [250525,  375800,   0.35],
    [375800,  Infinity, 0.37]
  ],
  hoh: [
    [0,       17000,    0.10],
    [17000,   64850,    0.12],
    [64850,   103350,   0.22],
    [103350,  197300,   0.24],
    [197300,  250500,   0.32],
    [250500,  626350,   0.35],
    [626350,  Infinity, 0.37]
  ],
  qss: [ // same as MFJ
    [0,       23850,    0.10],
    [23850,   96950,    0.12],
    [96950,   206700,   0.22],
    [206700,  394600,   0.24],
    [394600,  501050,   0.32],
    [501050,  751600,   0.35],
    [751600,  Infinity, 0.37]
  ]
};

// ── Long-Term Capital Gains / Qualified Dividends Brackets ──
const LTCG_BRACKETS = {
  single: [
    [0,       48350,    0.00],
    [48350,   533400,   0.15],
    [533400,  Infinity, 0.20]
  ],
  mfj: [
    [0,       96700,    0.00],
    [96700,   600050,   0.15],
    [600050,  Infinity, 0.20]
  ],
  mfs: [
    [0,       48350,    0.00],
    [48350,   300000,   0.15],
    [300000,  Infinity, 0.20]
  ],
  hoh: [
    [0,       64750,    0.00],
    [64750,   566700,   0.15],
    [566700,  Infinity, 0.20]
  ],
  qss: [
    [0,       96700,    0.00],
    [96700,   600050,   0.15],
    [600050,  Infinity, 0.20]
  ]
};

// ── Self-Employment Tax ──────────────────────────────────────
const SE_TAX = {
  ssRate:               0.124,
  medicareRate:         0.029,
  ssCap:                176100,   // SS wage base 2025 (up from $168,600)
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
// Source: IRS Rev. Proc. 2024-40
const AMT = {
  exemption: {
    single: 88100, mfj: 137000, mfs: 68500, hoh: 88100, qss: 137000
  },
  phaseoutStart: {
    single: 626350, mfj: 1252700, mfs: 626350, hoh: 626350, qss: 1252700
  },
  rate1: 0.26,
  rate2: 0.28,
  breakpoint: 239100  // 28% applies above this (up from $220,700 in 2024)
};

// ── Child Tax Credit (CTC) ───────────────────────────────────
const CTC = {
  perQualifyingChild:   2000,   // not inflation-adjusted
  perOtherDependent:    500,
  phaseoutStart: {
    single: 200000, mfj: 400000, mfs: 200000, hoh: 200000, qss: 400000
  },
  phaseoutPer1000:      50,    // $50 reduction per $1,000 over threshold
  maxRefundable:        1700,  // Additional CTC (unchanged for 2025)
  refundableRate:       0.15,
  earningsFloor:        2500   // must have > $2,500 earned income for ACTC
};

// ── Earned Income Credit (EIC/EITC) ─────────────────────────
// Source: irs.gov EITC tables, IR-2024-273
const EIC = {
  maxInvestmentIncome: 11950,  // up from $11,600
  maxAge:              { noChildren: { min: 25, max: 64 } },
  data: {
    0: { maxCredit: 649,  phaseInRate: 0.0765, phaseInEnd: 8490,  plateauEnd: { single: 9800,  mfj: 16840 }, phaseOutRate: 0.0765, maxIncome: { single: 19104, mfj: 26214 } },
    1: { maxCredit: 4328, phaseInRate: 0.3400, phaseInEnd: 11940, plateauEnd: { single: 22200, mfj: 22200 }, phaseOutRate: 0.1598, maxIncome: { single: 50434, mfj: 57554 } },
    2: { maxCredit: 7152, phaseInRate: 0.4000, phaseInEnd: 15010, plateauEnd: { single: 22200, mfj: 22200 }, phaseOutRate: 0.2106, maxIncome: { single: 57310, mfj: 64430 } },
    3: { maxCredit: 8046, phaseInRate: 0.4500, phaseInEnd: 15010, plateauEnd: { single: 22200, mfj: 22200 }, phaseOutRate: 0.2106, maxIncome: { single: 61555, mfj: 68675 } }
  }
};

// ── IRA Limits ───────────────────────────────────────────────
// Source: IRS Rev. Proc. 2024-40
const IRA = {
  contribution: { under50: 7000, over50: 8000 },  // unchanged for 2025
  // Traditional IRA deductibility phaseout (if covered by workplace plan)
  traditionalPhaseout: {
    covered: {
      single: { start: 79000,  end: 89000  },  // up from $77k-$87k
      mfj:    { start: 126000, end: 146000 },  // up from $123k-$143k
      mfs:    { start: 0,      end: 10000  },
      hoh:    { start: 79000,  end: 89000  }
    },
    // Spouse covered but taxpayer is not
    spouseCovered: {
      mfj:    { start: 236000, end: 246000 }   // up from $230k-$240k
    }
  },
  // Roth IRA contribution phaseout
  rothPhaseout: {
    single: { start: 150000, end: 165000 },  // up from $146k-$161k
    mfj:    { start: 236000, end: 246000 },  // up from $230k-$240k
    mfs:    { start: 0,      end: 10000  },
    hoh:    { start: 150000, end: 165000 },
    qss:    { start: 236000, end: 246000 }
  }
};

// ── Health Savings Account (HSA) ─────────────────────────────
// Source: IRS Rev. Proc. 2024-25
const HSA = {
  selfOnly:        4300,  // up from $4,150
  family:          8550,  // up from $8,300
  additionalAge55: 1000   // unchanged
};

// ── Qualified Business Income Deduction (Sec. 199A) ─────────
const QBI = {
  rate: 0.20,
  phaseoutStart: {
    single: 197300, mfj: 394600, mfs: 197300, hoh: 197300, qss: 394600
  },
  phaseoutEnd: {
    single: 247300, mfj: 494600, mfs: 247300, hoh: 247300, qss: 494600
  }
};

// ── Student Loan Interest Deduction ─────────────────────────
const STUDENT_LOAN = {
  maxDeduction: 2500,  // unchanged
  phaseout: {
    single: { start: 85000,  end: 100000 },  // up from $80k-$95k
    mfj:    { start: 170000, end: 200000 },  // up from $165k-$195k
    hoh:    { start: 85000,  end: 100000 }
    // MFS: not eligible
  }
};

// ── SALT Cap ─────────────────────────────────────────────────
const SALT_CAP = { normal: 10000, mfs: 5000 };  // unchanged (statutory)

// ── Child & Dependent Care Credit ───────────────────────────
const CDCC = {
  maxExpenses:    { one: 3000, twoPlus: 6000 },  // unchanged
  baseRate:       0.20,
  maxRate:        0.35,
  phasedownStart: 15000,
  phasedownPer2000: 0.01
};

// ── American Opportunity Credit (AOC) ───────────────────────
const AOC = {
  maxCredit:         2500,
  refundablePercent: 0.40,
  qualifiedExpenses: 4000,
  creditRate1:       1.00,
  creditRate2:       0.25,
  phaseout: {
    single: { start: 80000,  end: 90000  },  // unchanged
    mfj:    { start: 160000, end: 180000 }
  }
};

// ── Lifetime Learning Credit (LLC) ──────────────────────────
const LLC_CREDIT = {
  rate:         0.20,
  maxExpenses:  10000,
  maxCredit:    2000,
  phaseout: {
    single: { start: 80000,  end: 90000  },  // unchanged
    mfj:    { start: 160000, end: 180000 }
  }
};

// ── Retirement Saver's Credit (Form 8880) ───────────────────
// Source: IRS Rev. Proc. 2024-40
const SAVERS_CREDIT = {
  maxContribution: 2000,
  brackets: {
    single: [
      [23000,    0.50],
      [25000,    0.34],
      [38000,    0.10],
      [Infinity, 0.00]
    ],
    mfj: [
      [46000,    0.50],
      [50000,    0.34],
      [76500,    0.10],
      [Infinity, 0.00]
    ],
    hoh: [
      [34500,    0.50],
      [37500,    0.34],
      [57000,    0.10],
      [Infinity, 0.00]
    ],
    mfs: [
      [23000,    0.50],
      [25000,    0.34],
      [38000,    0.10],
      [Infinity, 0.00]
    ],
    qss: [
      [46000,    0.50],
      [50000,    0.34],
      [76500,    0.10],
      [Infinity, 0.00]
    ]
  }
};

// ── Social Security Benefit Taxability ──────────────────────
const SS_COMBINED_INCOME = {
  single_hoh: { t1: 25000, t2: 34000 },  // unchanged (not inflation-adjusted)
  mfj:        { t1: 32000, t2: 44000 },
  mfs_livedTogether: { alwaysUpTo85: true }
};

// ── Section 121 Home Sale Exclusion ─────────────────────────
const HOME_SALE = {
  single: 250000,  // unchanged (statutory)
  mfj:    500000
};

// ── Residential Clean Energy Credit (Form 5695 Pt. I) ───────
const CLEAN_ENERGY_CREDIT = {
  rate: 0.30
};

// ── Energy Efficient Home Improvement Credit (Form 5695 Pt. II) ─
const ENERGY_IMPROVEMENT_CREDIT = {
  annualCap:   1200,
  heatPumpCap: 2000,
  items: {
    windows:     { rate: 0.30, cap: 600  },
    doors:       { rate: 0.30, cap: 500  },
    roofing:     { rate: 0.30, cap: 600  },
    hvac:        { rate: 0.30, cap: 600  },
    insulation:  { rate: 0.30, noCap: true },
    heatPump:    { rate: 0.30, cap: 2000 },
    waterHeater: { rate: 0.30, cap: 600  },
    energyAudit: { rate: 0.30, cap: 150  }
  }
};

// ── 401(k) / Retirement Plan Limits ─────────────────────────
// Source: IRS IR-2024-285
const RETIREMENT_PLAN_LIMITS = {
  '401k':    { under50: 23500, over50: 31000 },  // up from $23k/$30.5k
  '403b':    { under50: 23500, over50: 31000 },
  'SIMPLE':  { under50: 16500, over50: 20000 },  // up from $16k/$19.5k
  'SEP':     { rate: 0.25, max: 70000 },          // up from $69,000
  'SOLO401k':{ under50: 23500, over50: 31000 }
};

// ── Early Withdrawal Penalty ─────────────────────────────────
const EARLY_WITHDRAWAL = {
  penaltyRate: 0.10,
  penaltyCodes: ['1'],
  exemptCodes: ['2','3','4','5','6','7','8','9','A','B','C','D','E','F','G','H','J','K','L','M','N','P','Q','R','S','T','U','W']
};

// ── Educator Expense Deduction ───────────────────────────────
const EDUCATOR = { max: 300, maxEach: 300 };  // unchanged

// ── Alimony Rules ────────────────────────────────────────────
const ALIMONY = {
  tcjaCutoff: new Date('2019-01-01')
};

// ── Premium Tax Credit (ACA, Form 8962) ─────────────────────
const PTC = {
  note: 'Requires Form 1095-A from marketplace. Credit phased down based on income relative to FPL.'
};

// ── Foreign Tax Credit ───────────────────────────────────────
const FOREIGN_TAX = {
  simpleLimit: 300,
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
  rentalRealEstateAllowance: 25000,
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

  standardDeduction: `A flat dollar amount that reduces your taxable income. For 2025: $15,000 (Single), $30,000 (MFJ), $22,500 (HOH). You choose the HIGHER of your standard deduction or your itemized deductions. Most taxpayers use the standard deduction because it's larger.`,

  itemizedDeductions: `Instead of the standard deduction, you can list actual deductible expenses on Schedule A. Common items: mortgage interest, state/local taxes (capped at $10,000), charitable donations, and large medical expenses. Only worthwhile if your total exceeds the standard deduction.`,

  saltCap: `The Tax Cuts and Jobs Act of 2017 capped the deduction for State and Local Taxes (SALT) — including state income/sales taxes AND property taxes — at $10,000 per return ($5,000 if MFS). This is one of the most impactful changes for high-tax-state residents.`,

  qbi: `The Qualified Business Income (QBI) deduction lets eligible self-employed people and pass-through business owners deduct up to 20% of their qualified business income. It phases out for higher incomes and has restrictions for certain "specified service trades or businesses" (like law, health, consulting). This can significantly reduce your tax bill.`,

  agi: `Adjusted Gross Income (AGI) = Total Income minus "above-the-line" deductions (like SE tax deduction, IRA contributions, student loan interest). AGI is important because many deductions, credits, and phase-outs are calculated based on your AGI.`,

  childTaxCredit: `Up to $2,000 per qualifying child under age 17. A qualifying child must: live with you more than half the year, be related to you, have a Social Security number, and not provide more than half their own support. Up to $1,700 per child may be refundable (you get it even if you owe no tax) through the Additional Child Tax Credit.`,

  eic: `The Earned Income Credit (EIC or EITC) is a refundable credit for low-to-moderate income workers. "Refundable" means you get money back even if you owe no tax. The amount depends on your income, filing status, and number of qualifying children. It's one of the largest anti-poverty programs in the U.S. tax code.`,

  seTax: `Self-Employment (SE) Tax = 15.3% of 92.35% of your net self-employment income (the reduction is because employees only pay 7.65% and can deduct the other half). You pay this in addition to regular income tax. You can deduct half of SE tax as an above-the-line adjustment, which reduces your AGI.`,

  niit: `The Net Investment Income Tax (NIIT) is an additional 3.8% tax on investment income (interest, dividends, capital gains, rental income) when your Modified AGI exceeds $200,000 (single) or $250,000 (MFJ). It was created by the Affordable Care Act to fund Medicare.`,

  amt: `The Alternative Minimum Tax (AMT) is a parallel tax system that limits the benefit of certain deductions. You calculate your tax both ways and pay whichever is higher. It primarily affects people with high incomes who have many deductions. The AMT exemption of $88,100 (single) / $137,000 (MFJ) means most middle-income taxpayers are not affected.`,

  socialSecurity: `Up to 85% of your Social Security benefits may be taxable depending on your "combined income" (AGI + nontaxable interest + 50% of SS benefits). If your combined income is under $25,000 (single) or $32,000 (MFJ), none is taxable.`,

  rentalIncome: `Rental income from real property is reported on Schedule E. You can deduct expenses like mortgage interest, property taxes, insurance, repairs, property management fees, and depreciation. Depreciation spreads the cost of the building over 27.5 years and can significantly reduce taxable rental income.`,

  passiveActivity: `Rental activities are generally "passive," meaning losses can only offset passive income — NOT your wages or self-employment income. Exception: if you "actively participate" in rental management AND your AGI is under $100,000, you can deduct up to $25,000 of rental losses against non-passive income. This allowance phases out between $100,000–$150,000 AGI.`,

  homeSale: `When you sell your primary home, you can exclude up to $250,000 of gain ($500,000 MFJ) if you owned AND lived in the home as your principal residence for at least 2 of the last 5 years. Gain = Selling price − Original purchase price − Cost of improvements − Selling expenses.`,

  washSale: `A wash sale occurs when you sell a security at a loss and buy the same or substantially identical security within 30 days before or after the sale. The IRS disallows this loss — you cannot use it to offset gains. The disallowed loss is added to the cost basis of the replacement shares.`,

  retirementDistribution: `Distributions from traditional 401(k)s, IRAs, and pensions are generally fully taxable as ordinary income. If you take money out before age 59½, you also owe a 10% early withdrawal penalty (Box 7 code "1" on your 1099-R), with some exceptions (disability, substantially equal payments, etc.).`,

  iraDeduction: `Contributions to a traditional IRA may be tax-deductible, reducing your current income. Deductibility depends on your income and whether you (or your spouse) are covered by a workplace retirement plan. The deduction phases out at higher incomes. Roth IRA contributions are never deductible, but qualified withdrawals are tax-free.`,

  estimatedTax: `If you have income not subject to withholding (self-employment, investments, rental income), you may need to make quarterly estimated tax payments to avoid an underpayment penalty. Payments are due April 15, June 16, September 15, and January 15.`,

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
