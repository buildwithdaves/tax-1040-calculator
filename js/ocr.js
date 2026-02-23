'use strict';
// ============================================================
//  OCR MODULE — Tesseract.js-based tax form reader
//  Supports: W-2, 1099-INT, 1099-DIV, 1099-B, 1099-NEC,
//            1099-MISC, 1099-R, SSA-1099, 1099-K
// ============================================================

const OCRModule = (() => {

  // ── Form field extraction patterns ───────────────────────
  const FORM_PATTERNS = {
    w2: {
      detect: /\bw-?2\b|wages.*tips|employer.*identification|employee.*social/i,
      fields: [
        { key: 'box1',  label: 'Box 1 – Wages',           pattern: /wages[,\s]+tips[^$\d]*[\$]?\s*([\d,]+\.?\d*)/i },
        { key: 'box2',  label: 'Box 2 – Federal tax withheld', pattern: /federal\s+income\s+tax\s+withheld[^$\d]*[\$]?\s*([\d,]+\.?\d*)/i },
        { key: 'box3',  label: 'Box 3 – SS wages',        pattern: /social\s+security\s+wages[^$\d]*[\$]?\s*([\d,]+\.?\d*)/i },
        { key: 'box4',  label: 'Box 4 – SS tax withheld', pattern: /social\s+security\s+tax\s+withheld[^$\d]*[\$]?\s*([\d,]+\.?\d*)/i },
        { key: 'box5',  label: 'Box 5 – Medicare wages',  pattern: /medicare\s+wages[^$\d]*[\$]?\s*([\d,]+\.?\d*)/i },
        { key: 'box6',  label: 'Box 6 – Medicare tax',    pattern: /medicare\s+tax\s+withheld[^$\d]*[\$]?\s*([\d,]+\.?\d*)/i },
        { key: 'box16', label: 'Box 16 – State wages',    pattern: /state\s+wages[^$\d]*[\$]?\s*([\d,]+\.?\d*)/i },
        { key: 'box17', label: 'Box 17 – State tax',      pattern: /state\s+income\s+tax[^$\d]*[\$]?\s*([\d,]+\.?\d*)/i },
        { key: 'employerName', label: 'Employer name',    pattern: /employer['s]?\s+name[^\n]*\n([^\n]+)/i, isText: true }
      ]
    },
    '1099-int': {
      detect: /1099[-\s]?int\b|interest\s+income/i,
      fields: [
        { key: 'box1',  label: 'Box 1 – Interest income',  pattern: /interest\s+income[^$\d]*[\$]?\s*([\d,]+\.?\d*)/i },
        { key: 'box2',  label: 'Box 2 – Early withdrawal', pattern: /early\s+withdrawal[^$\d]*[\$]?\s*([\d,]+\.?\d*)/i },
        { key: 'box3',  label: 'Box 3 – US Savings bonds', pattern: /savings\s+bonds[^$\d]*[\$]?\s*([\d,]+\.?\d*)/i },
        { key: 'box4',  label: 'Box 4 – Federal withheld', pattern: /federal\s+income\s+tax\s+withheld[^$\d]*[\$]?\s*([\d,]+\.?\d*)/i },
        { key: 'taxExempt', label: 'Tax-exempt interest',  pattern: /tax[-\s]?exempt\s+interest[^$\d]*[\$]?\s*([\d,]+\.?\d*)/i },
        { key: 'payerName', label: 'Payer name',           pattern: /payer['s]?\s+name[^\n]*\n([^\n]+)/i, isText: true }
      ]
    },
    '1099-div': {
      detect: /1099[-\s]?div\b|dividends\s+and\s+distributions/i,
      fields: [
        { key: 'ordinary',    label: 'Box 1a – Ordinary dividends', pattern: /total\s+ordinary\s+dividends[^$\d]*[\$]?\s*([\d,]+\.?\d*)/i },
        { key: 'qualified',   label: 'Box 1b – Qualified dividends', pattern: /qualified\s+dividends[^$\d]*[\$]?\s*([\d,]+\.?\d*)/i },
        { key: 'capGainDist', label: 'Box 2a – Total cap gain dist', pattern: /total\s+capital\s+gain[^$\d]*[\$]?\s*([\d,]+\.?\d*)/i },
        { key: 'federalWithholding', label: 'Box 4 – Federal tax', pattern: /federal\s+income\s+tax\s+withheld[^$\d]*[\$]?\s*([\d,]+\.?\d*)/i },
        { key: 'payerName',   label: 'Payer name',                  pattern: /payer['s]?\s+name[^\n]*\n([^\n]+)/i, isText: true }
      ]
    },
    '1099-b': {
      detect: /1099[-\s]?b\b|proceeds.*broker|broker.*barter/i,
      fields: [
        { key: 'proceeds',    label: 'Box 1d – Proceeds',   pattern: /proceeds[^$\d]*[\$]?\s*([\d,]+\.?\d*)/i },
        { key: 'basis',       label: 'Box 1e – Cost basis', pattern: /cost\s+or\s+other\s+basis[^$\d]*[\$]?\s*([\d,]+\.?\d*)/i },
        { key: 'federalWithholding', label: 'Box 4 – Federal tax', pattern: /federal\s+income\s+tax\s+withheld[^$\d]*[\$]?\s*([\d,]+\.?\d*)/i }
      ]
    },
    '1099-nec': {
      detect: /1099[-\s]?nec\b|nonemployee\s+compensation/i,
      fields: [
        { key: 'box1',  label: 'Box 1 – Nonemployee comp', pattern: /nonemployee\s+compensation[^$\d]*[\$]?\s*([\d,]+\.?\d*)/i },
        { key: 'box4',  label: 'Box 4 – Federal withheld', pattern: /federal\s+income\s+tax\s+withheld[^$\d]*[\$]?\s*([\d,]+\.?\d*)/i },
        { key: 'payerName', label: 'Payer name',           pattern: /payer['s]?\s+name[^\n]*\n([^\n]+)/i, isText: true }
      ]
    },
    '1099-misc': {
      detect: /1099[-\s]?misc\b|miscellaneous\s+information/i,
      fields: [
        { key: 'box3',  label: 'Box 3 – Other income',     pattern: /other\s+income[^$\d]*[\$]?\s*([\d,]+\.?\d*)/i },
        { key: 'box6',  label: 'Box 6 – Medical payments', pattern: /medical.{0,20}payments[^$\d]*[\$]?\s*([\d,]+\.?\d*)/i },
        { key: 'box7',  label: 'Box 7 – Payer made direct',pattern: /payer\s+made\s+direct/i },
        { key: 'box4',  label: 'Box 4 – Federal withheld', pattern: /federal\s+income\s+tax\s+withheld[^$\d]*[\$]?\s*([\d,]+\.?\d*)/i }
      ]
    },
    '1099-r': {
      detect: /1099[-\s]?r\b|distributions.*pensions|retirement.*distributions/i,
      fields: [
        { key: 'grossDistribution',  label: 'Box 1 – Gross distribution', pattern: /gross\s+distribution[^$\d]*[\$]?\s*([\d,]+\.?\d*)/i },
        { key: 'taxableAmount',      label: 'Box 2a – Taxable amount',    pattern: /taxable\s+amount[^$\d]*[\$]?\s*([\d,]+\.?\d*)/i },
        { key: 'federalWithholding', label: 'Box 4 – Federal withheld',   pattern: /federal\s+income\s+tax\s+withheld[^$\d]*[\$]?\s*([\d,]+\.?\d*)/i },
        { key: 'distributionCode',   label: 'Box 7 – Distribution code',  pattern: /distribution\s+code[^\n]*[\s:]([1-9A-Z]{1,2})/i, isText: true }
      ]
    },
    'ssa-1099': {
      detect: /ssa[-\s]?1099|social\s+security\s+benefit\s+statement|benefits\s+paid/i,
      fields: [
        { key: 'netBenefits',        label: 'Box 5 – Net benefits',       pattern: /net\s+benefits[^$\d]*[\$]?\s*([\d,]+\.?\d*)/i },
        { key: 'federalWithholding', label: 'Box 6 – Federal withheld',   pattern: /voluntary\s+federal\s+income\s+tax\s+withheld[^$\d]*[\$]?\s*([\d,]+\.?\d*)/i }
      ]
    },
    '1099-k': {
      detect: /1099[-\s]?k\b|payment\s+card.*third\s+party/i,
      fields: [
        { key: 'box1a', label: 'Box 1a – Gross payments', pattern: /gross\s+amount[^$\d]*[\$]?\s*([\d,]+\.?\d*)/i },
        { key: 'box1b', label: 'Box 1b – Card payments',  pattern: /card\s+not\s+present[^$\d]*[\$]?\s*([\d,]+\.?\d*)/i }
      ]
    }
  };

  // ── Detect form type from OCR text ────────────────────────
  function detectFormType(text) {
    for (const [type, config] of Object.entries(FORM_PATTERNS)) {
      if (config.detect.test(text)) return type;
    }
    return 'unknown';
  }

  // ── Extract fields from text using patterns ───────────────
  function extractFields(text, formType) {
    const config = FORM_PATTERNS[formType];
    if (!config) return {};
    const extracted = {};
    for (const field of config.fields) {
      const match = text.match(field.pattern);
      if (match && match[1]) {
        if (field.isText) {
          extracted[field.key] = match[1].trim();
        } else {
          const val = parseFloat(match[1].replace(/,/g, ''));
          if (!isNaN(val)) extracted[field.key] = val;
        }
      }
    }
    return extracted;
  }

  // ── Clean OCR text ────────────────────────────────────────
  function cleanText(text) {
    return text
      .replace(/[|]/g, 'I')   // common OCR artifact
      .replace(/[`]/g, "'")
      .replace(/\r\n/g, '\n')
      .replace(/\f/g, '\n')
      .trim();
  }

  // ── Main OCR processing ───────────────────────────────────
  async function processImage(file, onProgress) {
    if (typeof Tesseract === 'undefined') {
      throw new Error('Tesseract.js not loaded. Please check your internet connection.');
    }

    onProgress && onProgress(0, 'Loading image...');

    const worker = await Tesseract.createWorker('eng', 1, {
      logger: m => {
        if (m.status === 'recognizing text' && onProgress) {
          onProgress(Math.round(m.progress * 90), `Reading document... ${Math.round(m.progress * 100)}%`);
        }
      }
    });

    onProgress && onProgress(90, 'Analyzing form...');

    const result = await worker.recognize(file);
    await worker.terminate();

    const rawText = cleanText(result.data.text);
    const formType = detectFormType(rawText);
    const fields = extractFields(rawText, formType);

    onProgress && onProgress(100, 'Complete!');

    return {
      formType,
      fields,
      rawText,
      confidence: result.data.confidence,
      fileName: file.name || 'Uploaded document'
    };
  }

  // ── Map extracted fields to app state ────────────────────
  function mapToAppState(ocrResult, currentState) {
    const { formType, fields } = ocrResult;
    const newEntries = [];

    switch (formType) {
      case 'w2':
        newEntries.push({
          type: 'w2',
          data: {
            employerName: fields.employerName || '',
            box1: fields.box1 || '',
            box2: fields.box2 || '',
            box3: fields.box3 || '',
            box4: fields.box4 || '',
            box5: fields.box5 || '',
            box6: fields.box6 || '',
            box16: fields.box16 || '',
            box17: fields.box17 || ''
          }
        });
        break;

      case '1099-int':
        newEntries.push({
          type: 'interest',
          data: {
            payerName: fields.payerName || '',
            box1: fields.box1 || '',
            taxExempt: fields.taxExempt || '',
            federalWithholding: fields.box4 || ''
          }
        });
        break;

      case '1099-div':
        newEntries.push({
          type: 'dividend',
          data: {
            payerName: fields.payerName || '',
            ordinary: fields.ordinary || '',
            qualified: fields.qualified || '',
            capGainDist: fields.capGainDist || '',
            federalWithholding: fields.federalWithholding || ''
          }
        });
        break;

      case '1099-nec':
        newEntries.push({
          type: 'selfEmployment',
          data: {
            payerName: fields.payerName || '',
            revenue: fields.box1 || '',
            expenses: '',
            federalWithholding: fields.box4 || ''
          }
        });
        break;

      case '1099-r':
        newEntries.push({
          type: 'retirement',
          data: {
            grossDistribution: fields.grossDistribution || '',
            taxableAmount: fields.taxableAmount || '',
            taxableKnown: !!(fields.taxableAmount),
            federalWithholding: fields.federalWithholding || '',
            distributionCode: fields.distributionCode || '7'
          }
        });
        break;

      case 'ssa-1099':
        newEntries.push({
          type: 'socialSecurity',
          data: {
            netBenefits: fields.netBenefits || '',
            federalWithholding: fields.federalWithholding || ''
          }
        });
        break;

      default:
        // Return raw extraction for user to categorize
        break;
    }

    return newEntries;
  }

  return { processImage, mapToAppState, detectFormType, extractFields };
})();

if (typeof window !== 'undefined') window.OCRModule = OCRModule;
