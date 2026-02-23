'use strict';
// ============================================================
//  TAX CALCULATION ENGINE — 2024
//  Pure functions — no side effects, no DOM access.
//  Input: state object.  Output: detailed breakdown objects.
// ============================================================

// ── Utility ──────────────────────────────────────────────────
function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }
function positiveOrZero(n)    { return Math.max(0, n || 0); }
function num(v)               { return parseFloat(v) || 0; }

// Apply a bracket table to an amount; returns { tax, brackets[] }
function applyBrackets(amount, brackets) {
  let tax = 0;
  const breakdown = [];
  for (const [lo, hi, rate] of brackets) {
    if (amount <= lo) break;
    const taxable = Math.min(amount, hi) - lo;
    const bracketTax = taxable * rate;
    tax += bracketTax;
    if (taxable > 0) breakdown.push({ lo, hi: Math.min(amount, hi), rate, taxable, tax: bracketTax });
    if (amount <= hi) break;
  }
  return { tax, breakdown };
}

// Phase-out helper: linear reduction from start to end
function phaseout(value, agi, start, end) {
  if (agi <= start) return value;
  if (agi >= end)   return 0;
  return value * (1 - (agi - start) / (end - start));
}

// ── Step 1: Total Income ──────────────────────────────────────
function calcTotalIncome(s) {
  // W-2 wages
  const wages = s.w2.reduce((sum, w) => sum + num(w.box1), 0);

  // Self-employment (net of expenses)
  const seGross = s.selfEmployment.reduce((sum, b) => sum + num(b.revenue), 0);
  const seExpenses = s.selfEmployment.reduce((sum, b) => {
    const totalField = num(b.expenses);
    if (totalField > 0) return sum + totalField;
    // Auto-sum itemized fields; meals are 50% deductible
    const itemized = num(b.advertising) + num(b.carMileage) + num(b.commissions) +
      num(b.insurance) + num(b.legal) + num(b.meals) * 0.5 +
      num(b.officeSupplies) + num(b.rent) + num(b.repairs) +
      num(b.travel) + num(b.utilities) + num(b.wages) + num(b.otherExp);
    return sum + itemized;
  }, 0);
  const seNet = positiveOrZero(seGross - seExpenses);

  // Interest income
  const interest = s.interest.reduce((sum, i) => sum + num(i.box1), 0);
  const taxExemptInterest = s.interest.reduce((sum, i) => sum + num(i.taxExempt), 0);

  // Ordinary dividends
  const ordinaryDividends = s.dividends.reduce((sum, d) => sum + num(d.ordinary), 0);
  const qualifiedDividends = s.dividends.reduce((sum, d) => sum + num(d.qualified), 0);

  // Capital gains (short-term)
  const stcg = s.capitalGains.filter(g => g.term === 'short').reduce((sum, g) => {
    const gain = num(g.proceeds) - num(g.basis) + num(g.adjustment || 0);
    return sum + gain;
  }, 0);
  // Capital gains (long-term)
  const ltcg_raw = s.capitalGains.filter(g => g.term === 'long').reduce((sum, g) => {
    const gain = num(g.proceeds) - num(g.basis) + num(g.adjustment || 0);
    return sum + gain;
  }, 0);
  // Cap gain distributions from 1099-DIV box 2a (always long-term)
  const capGainDist = s.dividends.reduce((sum, d) => sum + num(d.capGainDist), 0);
  const ltcg = ltcg_raw + capGainDist;

  // Retirement distributions (1099-R)
  const retirementGross = s.retirement.reduce((sum, r) => sum + num(r.grossDistribution), 0);
  const retirementTaxable = s.retirement.reduce((sum, r) => {
    const taxable = r.taxableKnown ? num(r.taxableAmount) : num(r.grossDistribution);
    return sum + taxable;
  }, 0);

  // Social Security
  const ssBenefits = num(s.socialSecurity.netBenefits);

  // Rental income (Schedule E)
  const rentalGross = s.rental.reduce((sum, p) => sum + num(p.rent), 0);
  const rentalExpenses = s.rental.reduce((sum, p) => {
    return sum + num(p.advertising) + num(p.insurance) + num(p.managementFees)
      + num(p.mortgageInterest) + num(p.repairs) + num(p.taxes) + num(p.utilities)
      + num(p.otherExpenses) + calcDepreciation(p);
  }, 0);
  const rentalNet = rentalGross - rentalExpenses;

  // Other income
  const gambling = num(s.other.gambling);
  const alimonyReceived = num(s.other.alimonyReceived);
  const unemployment = num(s.other.unemployment);
  const stateRefund = num(s.other.stateRefund);  // only taxable if itemized prior year
  const prizes = num(s.other.prizes);
  const otherMisc = num(s.other.otherMisc);
  const k1Income = s.k1 ? s.k1.reduce((sum, k) => sum + num(k.ordinaryIncome), 0) : 0;
  const farmIncome = num(s.other.farmIncome);

  // Home sale gain (Schedule D / Section 121 exclusion)
  let homeSaleGain = 0;
  if (s.other.soldHome) {
    const proceeds = num(s.other.homeSaleProceeds);
    const basis = num(s.other.homePurchasePrice) + num(s.other.homeImprovements) + num(s.other.homeSellingCosts);
    const rawGain = proceeds - basis;
    if (rawGain > 0) {
      const filingStatus = s.personalInfo.filingStatus || 'single';
      const excl = s.other.meetsOwnershipTest
        ? (filingStatus === 'mfj' ? HOME_SALE.mfj : HOME_SALE.single) : 0;
      homeSaleGain = Math.max(0, rawGain - excl);
    }
  }

  return {
    wages,
    seGross, seExpenses, seNet,
    interest, taxExemptInterest,
    ordinaryDividends, qualifiedDividends,
    stcg, ltcg,
    retirementGross, retirementTaxable,
    ssBenefits,
    rentalGross, rentalExpenses, rentalNet,
    gambling, alimonyReceived, unemployment, stateRefund, prizes, otherMisc, k1Income, farmIncome,
    homeSaleGain,
    // Subtotal (SS taxable computed separately)
    subtotal: wages + seNet + interest + ordinaryDividends + stcg + ltcg
      + retirementTaxable + rentalNet + gambling + alimonyReceived
      + unemployment + (s.other.priorYearItemized ? stateRefund : 0)
      + prizes + otherMisc + k1Income + farmIncome + homeSaleGain
  };
}

function calcDepreciation(property) {
  // Straight-line over 27.5 years; basis = purchase price - land value
  const basisForDepr = positiveOrZero(num(property.purchasePrice) - num(property.landValue));
  return basisForDepr / 27.5;
}

// ── Step 2: Social Security Taxability ───────────────────────
function calcSSTaxable(s, income, filingStatus) {
  const ss = num(s.socialSecurity.netBenefits);
  if (ss === 0) return 0;
  const agi_before_ss = income.subtotal;
  const combinedIncome = agi_before_ss + income.taxExemptInterest + ss * 0.5;

  let taxableSS = 0;
  const thresholds = (filingStatus === 'mfj' || filingStatus === 'qss')
    ? SS_COMBINED_INCOME.mfj
    : SS_COMBINED_INCOME.single_hoh;

  if (filingStatus === 'mfs') {
    // MFS who lived with spouse: up to 85% always
    taxableSS = ss * 0.85;
  } else if (combinedIncome <= thresholds.t1) {
    taxableSS = 0;
  } else if (combinedIncome <= thresholds.t2) {
    taxableSS = Math.min(ss * 0.50, (combinedIncome - thresholds.t1) * 0.50);
  } else {
    const base = Math.min(ss * 0.50, (thresholds.t2 - thresholds.t1) * 0.50);
    taxableSS = Math.min(ss * 0.85, base + (combinedIncome - thresholds.t2) * 0.85);
  }
  return Math.min(taxableSS, ss * 0.85);
}

// ── Step 3: Adjustments to Income (Above-the-Line) ───────────
function calcAdjustments(s, income, filingStatus) {
  const educatorExpenses = Math.min(num(s.adjustments.educatorExpenses), EDUCATOR.max);
  const studentLoanInterest = calcStudentLoanDeduction(s, filingStatus, income.subtotal);

  // SE Tax: first compute SE tax so we can deduct half
  const seTaxCalc = calcSETax(s, filingStatus, income.seNet);
  const halfSETax = seTaxCalc.totalSETax / 2;

  const selfEmployedHealthInsurance = Math.min(
    num(s.adjustments.selfEmployedHealthInsurance),
    income.seNet - halfSETax  // cannot exceed net SE profit
  );

  const hsaDeduction = calcHSADeduction(s);
  const iraDeduction = calcIRADeduction(s, filingStatus, income);
  const alimonyPaid = s.other.divorcePreTCJA ? num(s.other.alimonyPaid) : 0;
  const earlyWithdrawalPenalty = num(s.adjustments.earlyWithdrawalPenalty);

  // SEP-IRA, SIMPLE, Solo 401k deduction
  const retirementPlanContrib = num(s.adjustments.retirementPlanContrib);

  const total = educatorExpenses + studentLoanInterest + halfSETax
    + selfEmployedHealthInsurance + hsaDeduction + iraDeduction
    + alimonyPaid + earlyWithdrawalPenalty + retirementPlanContrib;

  return {
    educatorExpenses,
    studentLoanInterest,
    halfSETax,
    selfEmployedHealthInsurance,
    hsaDeduction,
    iraDeduction,
    alimonyPaid,
    earlyWithdrawalPenalty,
    retirementPlanContrib,
    total
  };
}

function calcStudentLoanDeduction(s, filingStatus, agi) {
  if (filingStatus === 'mfs') return 0;
  const paid = Math.min(num(s.adjustments.studentLoanInterest), STUDENT_LOAN.maxDeduction);
  if (paid === 0) return 0;
  const po = STUDENT_LOAN.phaseout[filingStatus] || STUDENT_LOAN.phaseout.single;
  return positiveOrZero(phaseout(paid, agi, po.start, po.end));
}

function calcHSADeduction(s) {
  const contributed = num(s.adjustments.hsaContributions);
  const limit = s.personalInfo.hsaCoverage === 'family' ? HSA.family : HSA.selfOnly;
  const additionalAge = (num(s.personalInfo.age) >= 55) ? HSA.additionalAge55 : 0;
  return Math.min(contributed, limit + additionalAge);
}

function calcIRADeduction(s, filingStatus, income) {
  const contributed = num(s.adjustments.iraContribution);
  if (contributed === 0) return 0;
  const age = num(s.personalInfo.age);
  const limit = age >= 50 ? IRA.contribution.over50 : IRA.contribution.under50;
  const maxContrib = Math.min(contributed, limit);

  const coveredByPlan = s.adjustments.coveredByWorkplacePlan;
  const spouseCovered = s.adjustments.spouseCoveredByPlan;

  let phaseoutRange;
  if (coveredByPlan) {
    phaseoutRange = IRA.traditionalPhaseout.covered[filingStatus]
      || IRA.traditionalPhaseout.covered.single;
  } else if (spouseCovered && filingStatus === 'mfj') {
    phaseoutRange = IRA.traditionalPhaseout.spouseCovered.mfj;
  } else {
    return maxContrib; // fully deductible
  }
  return positiveOrZero(phaseout(maxContrib, income.subtotal, phaseoutRange.start, phaseoutRange.end));
}

// ── Step 4: AGI ───────────────────────────────────────────────
function calcAGI(totalIncome, taxableSS, adjustments) {
  return positiveOrZero(totalIncome.subtotal + taxableSS - adjustments.total);
}

// ── Step 5: Deductions ────────────────────────────────────────
function calcDeductions(s, agi, filingStatus) {
  // Standard deduction base
  let stdBase = STANDARD_DEDUCTION[filingStatus] || STANDARD_DEDUCTION.single;

  // Additional std deduction for age 65+ or blind
  const isOlder = s.personalInfo.age >= 65;
  const isBlind = s.personalInfo.blind;
  const spouseOlder = s.personalInfo.spouseAge >= 65;
  const spouseBlind = s.personalInfo.spouseBlind;
  const perPerson = (filingStatus === 'single' || filingStatus === 'hoh')
    ? ADDITIONAL_STD_DEDUCTION.single_hoh : ADDITIONAL_STD_DEDUCTION.other;

  let additionalBoxes = 0;
  if (isOlder) additionalBoxes++;
  if (isBlind) additionalBoxes++;
  if (filingStatus === 'mfj' || filingStatus === 'qss' || filingStatus === 'mfs') {
    if (spouseOlder) additionalBoxes++;
    if (spouseBlind) additionalBoxes++;
  }
  const standardDeduction = stdBase + additionalBoxes * perPerson;

  // Itemized deductions (Schedule A)
  const medicalExpenses = Math.max(0, num(s.itemized.medicalExpenses) - agi * 0.075);
  const stateIncomeTax = num(s.itemized.stateIncomeTax);
  const localIncomeTax = num(s.itemized.localIncomeTax);
  const realEstateTax = num(s.itemized.realEstateTax);
  const saltCap = (filingStatus === 'mfs') ? SALT_CAP.mfs : SALT_CAP.normal;
  const saltDeduction = Math.min(stateIncomeTax + localIncomeTax + realEstateTax, saltCap);

  const mortgageInterest = num(s.itemized.mortgageInterest);
  const pointsPaid = num(s.itemized.pointsPaid);
  const charitableCash = num(s.itemized.charitableCash);
  const charitableNonCash = num(s.itemized.charitableNonCash);
  const investmentInterest = num(s.itemized.investmentInterest);
  const gamblingLosses = Math.min(num(s.itemized.gamblingLosses), num(s.other.gambling));
  const casualtyLoss = num(s.itemized.casualtyLoss);
  const otherItemized = num(s.itemized.other);

  const totalItemized = medicalExpenses + saltDeduction + mortgageInterest + pointsPaid
    + charitableCash + charitableNonCash + investmentInterest + gamblingLosses
    + casualtyLoss + otherItemized;

  const useItemized = s.deductions.forceItemized || totalItemized > standardDeduction;
  const deductionUsed = useItemized ? totalItemized : standardDeduction;

  return {
    standardDeduction,
    medicalExpenses,
    stateIncomeTax, localIncomeTax, realEstateTax, saltCap, saltDeduction,
    mortgageInterest, pointsPaid, charitableCash, charitableNonCash,
    investmentInterest, gamblingLosses, casualtyLoss, otherItemized,
    totalItemized,
    useItemized,
    deductionUsed
  };
}

// ── Step 6: QBI Deduction (Sec. 199A) ────────────────────────
function calcQBI(s, agi, filingStatus) {
  const seNet = positiveOrZero(
    s.selfEmployment.reduce((sum, b) => sum + num(b.revenue) - num(b.expenses), 0)
  );
  const k1Qbi = s.k1 ? s.k1.reduce((sum, k) => sum + (k.isQBI ? num(k.ordinaryIncome) : 0), 0) : 0;
  const totalQBI = seNet + k1Qbi;
  if (totalQBI <= 0) return { deduction: 0, totalQBI };

  const po = QBI.phaseoutStart[filingStatus] || QBI.phaseoutStart.single;
  const pe = QBI.phaseoutEnd[filingStatus] || QBI.phaseoutEnd.single;
  const rawDeduction = totalQBI * QBI.rate;

  // Deduction cannot exceed 20% of (taxable income - net capital gains)
  // (simplified — full calculation requires W-2 wage test above phase-out)
  const deduction = positiveOrZero(phaseout(rawDeduction, agi, po, pe));
  return { deduction, totalQBI };
}

// ── Step 7: Taxable Income ────────────────────────────────────
function calcTaxableIncome(agi, deductions, qbi) {
  return positiveOrZero(agi - deductions.deductionUsed - qbi.deduction);
}

// ── Step 8: Ordinary Income Tax ──────────────────────────────
function calcOrdinaryTax(taxableIncome, income, filingStatus) {
  // Qualified dividends + long-term cap gains are taxed at preferential rates
  // We carve them out of ordinary income
  const preferential = positiveOrZero(income.qualifiedDividends + income.ltcg);
  const ordinaryTaxable = positiveOrZero(taxableIncome - preferential);

  const brackets = ORDINARY_BRACKETS[filingStatus] || ORDINARY_BRACKETS.single;
  const { tax, breakdown } = applyBrackets(ordinaryTaxable, brackets);

  return { tax, breakdown, ordinaryTaxable, preferential };
}

// ── Step 9: Long-Term Capital Gains Tax ──────────────────────
function calcLTCGTax(taxableIncome, income, ordinaryTax, filingStatus) {
  // LTCG tax uses the "stacking" method: LTCG sits on top of ordinary income
  const preferential = positiveOrZero(income.qualifiedDividends + income.ltcg);
  if (preferential === 0) return { tax: 0, breakdown: [], preferential: 0 };

  const ordinaryTaxable = positiveOrZero(taxableIncome - preferential);
  const brackets = LTCG_BRACKETS[filingStatus] || LTCG_BRACKETS.single;

  let tax = 0;
  const breakdown = [];
  let remaining = preferential;
  let stackedBase = ordinaryTaxable;

  for (const [lo, hi, rate] of brackets) {
    if (remaining <= 0) break;
    if (stackedBase >= hi) { stackedBase = Math.max(stackedBase, hi); continue; }
    const startPoint = Math.max(stackedBase, lo);
    const spaceInBracket = hi - startPoint;
    if (spaceInBracket <= 0) continue;
    const taxable = Math.min(remaining, spaceInBracket);
    const bracketTax = taxable * rate;
    tax += bracketTax;
    if (taxable > 0) breakdown.push({ lo: startPoint, hi: startPoint + taxable, rate, taxable, tax: bracketTax });
    remaining -= taxable;
    stackedBase = startPoint + taxable;
  }
  return { tax, breakdown, preferential };
}

// ── Step 10: Self-Employment Tax ─────────────────────────────
function calcSETax(s, filingStatus, seNet) {
  if (!seNet) seNet = positiveOrZero(
    s.selfEmployment.reduce((sum, b) => sum + num(b.revenue) - num(b.expenses), 0)
  );
  if (seNet <= 0) return { ssTax: 0, medicareTax: 0, addlMedicareTax: 0, totalSETax: 0 };

  const netEarnings = seNet * 0.9235; // 92.35% — IRS Schedule SE
  const ssTaxable = Math.min(netEarnings, SE_TAX.ssCap);
  const ssTax = ssTaxable * SE_TAX.ssRate;
  const medicareTax = netEarnings * SE_TAX.medicareRate;

  const threshold = SE_TAX.addlMedicareThreshold[filingStatus] || SE_TAX.addlMedicareThreshold.single;
  const addlMedicareTax = positiveOrZero(netEarnings - threshold) * SE_TAX.addlMedicareRate;

  const totalSETax = ssTax + medicareTax + addlMedicareTax;
  return { ssTax, medicareTax, addlMedicareTax, totalSETax, netEarnings };
}

// ── Step 11: Net Investment Income Tax ───────────────────────
function calcNIIT(s, agi, income, filingStatus) {
  const threshold = NIIT.threshold[filingStatus] || NIIT.threshold.single;
  if (agi <= threshold) return { tax: 0, nii: 0 };

  // NII = interest + dividends + cap gains + rental net (passive)
  const nii = positiveOrZero(income.interest + income.ordinaryDividends + income.stcg + income.ltcg
    + Math.max(0, income.rentalNet));  // only net rental if positive

  const excessMAGI = positiveOrZero(agi - threshold);
  const taxableNII = Math.min(nii, excessMAGI);
  return { tax: taxableNII * NIIT.rate, nii, taxableNII, threshold };
}

// ── Step 12: Additional Medicare Tax (Form 8959) ─────────────
function calcAddlMedicareTax(s, income, filingStatus) {
  const threshold = SE_TAX.addlMedicareThreshold[filingStatus] || SE_TAX.addlMedicareThreshold.single;
  const totalWages = income.wages;
  const excess = positiveOrZero(totalWages - threshold);
  const tax = excess * SE_TAX.addlMedicareRate;
  return { tax, excess, threshold };
}

// ── Step 13: Alternative Minimum Tax ─────────────────────────
function calcAMT(agi, deductions, filingStatus, income) {
  // AMT Income = AGI + preferences/adjustments (simplified: add back SALT, misc items)
  const amtPreferences = deductions.useItemized
    ? positiveOrZero(deductions.saltDeduction) // SALT not deductible for AMT
    : 0;
  // For standard deduction, there's no add-back needed for SALT
  const amti = agi - (deductions.useItemized ? deductions.mortgageInterest + deductions.charitableCash + deductions.charitableNonCash + deductions.medicalExpenses : 0);
  // Simplified AMTI: use AMT income = AGI (conservative estimate; actual requires Form 6251)
  const amtiSimple = agi + amtPreferences;

  const exemption = AMT.exemption[filingStatus] || AMT.exemption.single;
  const phaseoutStart = AMT.phaseoutStart[filingStatus] || AMT.phaseoutStart.single;
  const exemptionReduction = Math.max(0, (amtiSimple - phaseoutStart)) * 0.25;
  const effectiveExemption = Math.max(0, exemption - exemptionReduction);
  const amtBase = positiveOrZero(amtiSimple - effectiveExemption);

  // AMT excludes LTCG/QD at preferential rates
  const ltcgQD = positiveOrZero(income.qualifiedDividends + income.ltcg);
  const amtOrdinary = positiveOrZero(amtBase - ltcgQD);

  const amtTax1 = Math.min(amtOrdinary, AMT.breakpoint) * AMT.rate1;
  const amtTax2 = positiveOrZero(amtOrdinary - AMT.breakpoint) * AMT.rate2;
  const amtTaxOrdinary = amtTax1 + amtTax2;

  // LTCG/QD in AMT: still use preferential rates
  const ltcgAMT = applyBrackets(positiveOrZero(ltcgQD), LTCG_BRACKETS[filingStatus] || LTCG_BRACKETS.single).tax;
  const amtTotal = amtTaxOrdinary + ltcgAMT;

  return { amti: amtiSimple, exemption: effectiveExemption, amtBase, amtTotal };
}

// ── Step 14: Early Withdrawal Penalty (Form 5329) ────────────
function calcEarlyWithdrawal(s) {
  return s.retirement.reduce((sum, r) => {
    if (r.distributionCode === '1') {
      return sum + num(r.taxableAmount) * EARLY_WITHDRAWAL.penaltyRate;
    }
    return sum;
  }, 0);
}

// ── Step 15: Credits ─────────────────────────────────────────
function calcCredits(s, agi, income, filingStatus, taxBeforeCredits) {
  const ctc = calcCTC(s, agi, income, filingStatus);
  const eic = calcEIC(s, agi, income, filingStatus);
  const cdcc = calcCDCC(s, agi, income);
  const aoc = calcAOC(s, agi, filingStatus);
  const llc = calcLLC(s, agi, filingStatus);
  const saversCredit = calcSaversCredit(s, agi, filingStatus);
  const cleanEnergy = calcCleanEnergyCredit(s);
  const energyImprov = calcEnergyImprovementCredit(s);
  const foreignTax = num(s.credits.foreignTax);
  const ptc = num(s.credits.premiumTaxCredit);
  const adoptionCredit = num(s.credits.adoptionCredit);
  const otherCredit = num(s.credits.other);

  const nonRefundable = ctc.nonRefundable + cdcc.credit + aoc.nonRefundable + llc.credit
    + saversCredit.credit + cleanEnergy.credit + energyImprov.credit
    + foreignTax + adoptionCredit + otherCredit;

  const refundable = ctc.refundable + eic.credit + aoc.refundable + ptc;

  return {
    ctc, eic, cdcc, aoc, llc, saversCredit,
    cleanEnergy, energyImprov, foreignTax, ptc, adoptionCredit, otherCredit,
    nonRefundable, refundable,
    totalCredits: nonRefundable + refundable
  };
}

function calcCTC(s, agi, income, filingStatus) {
  const qc = (s.dependents || []).filter(d => d.qualifying && num(d.age) < 17).length;
  const otherDep = (s.dependents || []).filter(d => d.qualifying && num(d.age) >= 17).length;

  const phaseoutStart = CTC.phaseoutStart[filingStatus] || CTC.phaseoutStart.single;
  const excess = positiveOrZero(agi - phaseoutStart);
  const reduction = Math.ceil(excess / 1000) * CTC.phaseoutPer1000;

  const maxCredit = qc * CTC.perQualifyingChild + otherDep * CTC.perOtherDependent;
  const creditBeforePhaseout = maxCredit;
  const creditAfterPhaseout = positiveOrZero(creditBeforePhaseout - reduction);

  // Additional CTC (refundable portion)
  const earnedIncome = income.wages + income.seNet;
  const acticBase = positiveOrZero(earnedIncome - CTC.earningsFloor) * CTC.refundableRate;
  const refundable = Math.min(CTC.maxRefundable * qc, acticBase);

  return {
    qc, otherDep, maxCredit, creditAfterPhaseout,
    nonRefundable: Math.min(creditAfterPhaseout, creditAfterPhaseout), // applied against tax
    refundable
  };
}

function calcEIC(s, agi, income, filingStatus) {
  const earned = income.wages + income.seNet;
  const investmentIncome = income.interest + income.ordinaryDividends + income.stcg + income.ltcg;
  if (investmentIncome > EIC.maxInvestmentIncome) return { credit: 0 };

  const numChildren = Math.min(3, (s.dependents || []).filter(d => d.qualifying && num(d.age) < 19).length);
  const key = numChildren.toString();
  const d = EIC.data[numChildren];
  if (!d) return { credit: 0 };

  const maxIncome = (filingStatus === 'mfj') ? d.maxIncome.mfj : d.maxIncome.single;
  const useIncome = Math.max(earned, agi);  // use earned income OR AGI whichever is higher for phase-out check

  if (useIncome > maxIncome) return { credit: 0 };

  // Compute credit based on earned income (phase-in) then reduce for high AGI (phase-out)
  const plateauEnd = (filingStatus === 'mfj') ? d.plateauEnd.mfj : d.plateauEnd.single;
  let credit;
  if (earned <= d.phaseInEnd) {
    credit = Math.min(earned * d.phaseInRate, d.maxCredit);
  } else if (useIncome <= plateauEnd) {
    credit = d.maxCredit;
  } else {
    credit = positiveOrZero(d.maxCredit - (useIncome - plateauEnd) * d.phaseOutRate);
  }
  credit = Math.max(0, Math.min(credit, d.maxCredit));

  // Age check for no-child credit
  if (numChildren === 0) {
    const age = num(s.personalInfo.age);
    if (age < 25 || age > 64) return { credit: 0 };
  }

  return { credit, numChildren, earned, investmentIncome };
}

function calcCDCC(s, agi, income) {
  const expenses = num(s.credits.dependentCareExpenses);
  if (expenses === 0) return { credit: 0 };
  const qualifyingPeople = s.credits.dependentCarePersons || 1;
  const maxExpenses = qualifyingPeople >= 2 ? CDCC.maxExpenses.twoPlus : CDCC.maxExpenses.one;
  const cappedExpenses = Math.min(expenses, maxExpenses);

  // Credit rate decreases as income rises above $15,000
  const incomeOver15k = positiveOrZero(agi - CDCC.phasedownStart);
  const reductions = Math.floor(incomeOver15k / 2000);
  const creditRate = Math.max(CDCC.baseRate, CDCC.maxRate - reductions * CDCC.phasedownPer2000);

  return { credit: cappedExpenses * creditRate, creditRate, cappedExpenses };
}

function calcAOC(s, agi, filingStatus) {
  const expenses = num(s.credits.aocExpenses);
  if (expenses === 0) return { nonRefundable: 0, refundable: 0 };
  const qualified = Math.min(expenses, AOC.qualifiedExpenses);
  const rawCredit = Math.min(2000, qualified) * AOC.creditRate1
    + Math.max(0, Math.min(2000, qualified - 2000)) * AOC.creditRate2;
  const po = AOC.phaseout[(filingStatus === 'mfj') ? 'mfj' : 'single'];
  const credit = phaseout(rawCredit, agi, po.start, po.end);
  return {
    nonRefundable: credit * (1 - AOC.refundablePercent),
    refundable: credit * AOC.refundablePercent,
    total: credit
  };
}

function calcLLC(s, agi, filingStatus) {
  const expenses = num(s.credits.llcExpenses);
  if (expenses === 0) return { credit: 0 };
  const qualified = Math.min(expenses, LLC_CREDIT.maxExpenses);
  const rawCredit = Math.min(qualified * LLC_CREDIT.rate, LLC_CREDIT.maxCredit);
  const po = LLC_CREDIT.phaseout[(filingStatus === 'mfj') ? 'mfj' : 'single'];
  return { credit: phaseout(rawCredit, agi, po.start, po.end) };
}

function calcSaversCredit(s, agi, filingStatus) {
  const contributions = Math.min(num(s.credits.retirementContributions), SAVERS_CREDIT.maxContribution);
  if (contributions === 0) return { credit: 0 };
  const brackets = SAVERS_CREDIT.brackets[filingStatus] || SAVERS_CREDIT.brackets.single;
  for (const [maxAGI, rate] of brackets) {
    if (agi <= maxAGI) return { credit: contributions * rate, rate };
  }
  return { credit: 0 };
}

function calcCleanEnergyCredit(s) {
  const solar = num(s.credits.solarInstallation);
  const wind = num(s.credits.windEnergy);
  const battery = num(s.credits.batteryStorage);
  const total = solar + wind + battery;
  return { credit: total * CLEAN_ENERGY_CREDIT.rate, total };
}

function calcEnergyImprovementCredit(s) {
  const ec = s.credits.energyImprovements || {};
  const windows = Math.min(num(ec.windows) * 0.30, 600);
  const doors = Math.min(num(ec.doors) * 0.30, 500);
  const hvac = Math.min(num(ec.hvac) * 0.30, 600);
  const insulation = num(ec.insulation) * 0.30;
  const heatPump = Math.min(num(ec.heatPump) * 0.30, 2000);
  const energyAudit = Math.min(num(ec.energyAudit) * 0.30, 150);
  const waterHeater = Math.min(num(ec.waterHeater) * 0.30, 600);

  const generalTotal = Math.min(windows + doors + hvac + insulation + energyAudit + waterHeater, 1200);
  const credit = generalTotal + heatPump;
  return { credit, windows, doors, hvac, insulation, heatPump, energyAudit };
}

// ── Step 16: Total Tax & Withholding ─────────────────────────
function calcWithholding(s) {
  const federalW2 = s.w2.reduce((sum, w) => sum + num(w.box2), 0);
  const retirementWH = s.retirement.reduce((sum, r) => sum + num(r.federalWithholding), 0);
  const interestWH = s.interest.reduce((sum, i) => sum + num(i.federalWithholding), 0);
  const dividendWH = s.dividends.reduce((sum, d) => sum + num(d.federalWithholding), 0);
  const otherWH = num(s.other.otherWithholding);
  const estimatedPayments = num(s.payments.estimatedTax);
  const extensionPayment = num(s.payments.extensionPayment);
  const excessSS = calcExcessSSWithholding(s);

  const total = federalW2 + retirementWH + interestWH + dividendWH + otherWH
    + estimatedPayments + extensionPayment + excessSS;
  return { federalW2, retirementWH, interestWH, dividendWH, otherWH, estimatedPayments, extensionPayment, excessSS, total };
}

function calcExcessSSWithholding(s) {
  // If you had multiple employers and total SS withheld > SS wage base tax
  const totalSSW = s.w2.reduce((sum, w) => sum + num(w.box4), 0);
  const ssCap = SE_TAX.ssCap * 0.062; // 6.2% employee rate * cap
  return positiveOrZero(totalSSW - ssCap * (totalSSW / Math.max(totalSSW, 1)));
}

// ── MAIN CALCULATION ENTRY POINT ─────────────────────────────
function calculateTax(state) {
  const s = state;
  const filingStatus = s.personalInfo.filingStatus || 'single';

  // 1. Total Income
  const income = calcTotalIncome(s);

  // 2. SS Taxability
  const taxableSS = calcSSTaxable(s, income, filingStatus);
  income.taxableSS = taxableSS;
  income.subtotal += taxableSS;

  // 3. SE Tax (needed for half-SE-tax adjustment)
  const seTaxCalc = calcSETax(s, filingStatus, income.seNet);

  // 4. Adjustments to Income
  const adjustments = calcAdjustments(s, income, filingStatus);

  // 5. AGI
  const agi = calcAGI(income, taxableSS, adjustments);

  // 6. Deductions
  const deductions = calcDeductions(s, agi, filingStatus);

  // 7. QBI
  const qbiCalc = calcQBI(s, agi, filingStatus);

  // 8. Taxable Income
  const taxableIncome = calcTaxableIncome(agi, deductions, qbiCalc);

  // 9. Ordinary Income Tax
  const ordinaryTax = calcOrdinaryTax(taxableIncome, income, filingStatus);

  // 10. LTCG Tax
  const ltcgTax = calcLTCGTax(taxableIncome, income, ordinaryTax, filingStatus);

  // 11. Tax before credits
  const taxBeforeCreditsBeforeAMT = ordinaryTax.tax + ltcgTax.tax;

  // 12. AMT
  const amtCalc = calcAMT(agi, deductions, filingStatus, income);
  const amtAdditional = positiveOrZero(amtCalc.amtTotal - taxBeforeCreditsBeforeAMT);

  // 13. NIIT
  const niitCalc = calcNIIT(s, agi, income, filingStatus);

  // 14. Additional Medicare Tax on wages
  const addlMedicareTax = calcAddlMedicareTax(s, income, filingStatus);

  // 15. Early Withdrawal Penalty
  const earlyWithdrawalPenalty = calcEarlyWithdrawal(s);

  // 16. Tax before credits
  const taxBeforeCredits = taxBeforeCreditsBeforeAMT + amtAdditional
    + seTaxCalc.totalSETax + niitCalc.tax + addlMedicareTax.tax
    + earlyWithdrawalPenalty;

  // 17. Credits
  const credits = calcCredits(s, agi, income, filingStatus, taxBeforeCredits);

  // 18. Tax after non-refundable credits (cannot go below 0)
  const taxAfterNonRefundable = positiveOrZero(taxBeforeCredits - credits.nonRefundable);

  // 19. Total tax
  const totalTax = positiveOrZero(taxAfterNonRefundable);

  // 20. Withholding
  const withholding = calcWithholding(s);

  // 21. Balance
  const refundableCredits = credits.refundable;
  const totalPayments = withholding.total + refundableCredits;
  const balance = totalTax - totalPayments;

  // 22. Effective rate
  const totalIncomeFull = income.subtotal;
  const effectiveRate = totalIncomeFull > 0 ? totalTax / totalIncomeFull : 0;

  // 23. Marginal rate
  const marginalBracket = (ORDINARY_BRACKETS[filingStatus] || ORDINARY_BRACKETS.single)
    .find(([lo, hi]) => taxableIncome > lo && taxableIncome <= hi);
  const marginalRate = marginalBracket ? marginalBracket[2] : 0.37;

  return {
    income,
    taxableSS,
    adjustments,
    agi,
    deductions,
    qbi: qbiCalc,
    taxableIncome,
    ordinaryTax,
    ltcgTax,
    amtCalc, amtAdditional,
    seTax: seTaxCalc,
    niit: niitCalc,
    addlMedicareTax,
    earlyWithdrawalPenalty,
    taxBeforeCredits,
    credits,
    taxAfterNonRefundable,
    totalTax,
    withholding,
    refundableCredits,
    totalPayments,
    balance,
    effectiveRate,
    marginalRate,
    filingStatus
  };
}

// Make available globally for browser
if (typeof window !== 'undefined') {
  window.calculateTax = calculateTax;
  window.calcSETax = calcSETax;
}
if (typeof module !== 'undefined') {
  module.exports = { calculateTax, calcSETax };
}
