/**
 * Reference Range Validation Engine
 * 
 * Pure utility for evaluating patient results against parameter rules.
 * Supports MIN_MAX, GENDER_SPECIFIC, and THRESHOLD_COMPARISON rule types
 * with full backwards compatibility for legacy isGenderSpecific boolean.
 */

/**
 * Extracts the first numeric value from a result string.
 * @param {string|number} resultValue
 * @returns {number|null}
 */
function parseNumericResult(resultValue) {
  if (resultValue == null) return null;
  if (typeof resultValue === 'number') return resultValue;
  const match = String(resultValue).match(/([\d.]+)/);
  return match ? parseFloat(match[1]) : null;
}

/**
 * Checks if a numeric value falls outside [min, max].
 * Returns null if bounds are insufficient, true if abnormal, false if normal.
 */
function isOutsideBounds(numericValue, min, max) {
  if (numericValue == null) return null;
  if ((min == null || min === '') && (max == null || max === '')) return null;
  
  const minNum = (min !== null && min !== '') ? parseFloat(min) : null;
  const maxNum = (max !== null && max !== '') ? parseFloat(max) : null;
  
  if (minNum !== null && !isNaN(minNum) && numericValue < minNum) return true;
  if (maxNum !== null && !isNaN(maxNum) && numericValue > maxNum) return true;
  return false;
}

/**
 * Formats a min-max range as a display string.
 */
function formatMinMax(min, max, units) {
  if (min != null && max != null) return `${min}-${max} ${units || ''}`.trim();
  if (min != null) return `≥ ${min} ${units || ''}`.trim();
  if (max != null) return `≤ ${max} ${units || ''}`.trim();
  return '';
}

/**
 * Resolves the effective ruleType for a parameter.
 * Handles backwards compatibility with legacy isGenderSpecific boolean.
 */
function resolveRuleType(param) {
  let ruleType = param.ruleType || 'MIN_MAX';
  // Legacy mapping: Prioritize GENDER_SPECIFIC if isGenderSpecific is true,
  // even if ruleType defaulted to MIN_MAX in the DB.
  if (param.isGenderSpecific === true && ruleType === 'MIN_MAX') {
    return 'GENDER_SPECIFIC';
  }
  return ruleType;
}

/**
 * Evaluates a single threshold comparison rule against a numeric value.
 * @returns {boolean} true if the rule matches
 */
function matchesRule(numericValue, rule) {
  if (numericValue == null || rule.value == null) return false;
  switch (rule.operator) {
    case '<':  return numericValue < rule.value;
    case '<=': return numericValue <= rule.value;
    case '>':  return numericValue > rule.value;
    case '>=': return numericValue >= rule.value;
    case '==': return numericValue === rule.value;
    case 'between':
      if (rule.valueTo == null) return false;
      return numericValue >= rule.value && numericValue <= rule.valueTo;
    default:   return false;
  }
}

/**
 * Evaluates a single threshold comparison rule against a text value.
 * @returns {boolean} true if the rule matches
 */
function matchesTextRule(textValue, rule) {
  if (textValue == null || rule.value == null) return false;
  const t = String(textValue).toLowerCase().trim();
  const v = String(rule.value).toLowerCase().trim();
  switch (rule.operator) {
    case 'equals':
    case '==': return t === v;
    case 'contains': return t.includes(v);
    default: return false;
  }
}

/**
 * Formats a single comparison rule for PDF display.
 */
function formatRuleDisplay(rule) {
  const opSymbols = { '<': '<', '<=': '≤', '>': '>', '>=': '≥', '==': '=' };
  if (rule.operator === 'between') {
    return `${rule.value}-${rule.valueTo}: ${rule.classification || ''}`;
  }
  const sym = opSymbols[rule.operator] || rule.operator;
  return `${sym} ${rule.value}: ${rule.classification || ''}`;
}

/**
 * Evaluates a patient's result against a parameter's rule definition.
 *
 * @param {string|number} resultValue   - The patient's raw result (e.g., "215", 14.2)
 * @param {Object}        parameterLogic - The parameter object from the schema
 * @param {string}        patientGender  - 'Male' | 'Female' (case-insensitive)
 * @returns {{
 *   classification: string|null,
 *   isAbnormal: boolean,
 *   highlight: boolean,
 *   critical: boolean,
 *   rangeDisplay: string
 * }}
 */
function evaluatePatientResult(resultValue, parameterLogic, patientGender) {
  const result = {
    classification: null,
    isAbnormal: false,
    highlight: false,
    critical: false,
    rangeDisplay: ''
  };

  if (!parameterLogic) return result;

  const dataType = parameterLogic.dataType || 'NUMERIC';
  const units = parameterLogic.units || '';
  const gender = (patientGender || '').toLowerCase();
  const numericValue = parseNumericResult(resultValue);
  const textValue = String(resultValue || '').trim();

  if (dataType === 'TEXT' || dataType === 'QUALITATIVE') {
      const ranges = parameterLogic.referenceRanges || [];
      let expectedNormal = null;
      for (const r of ranges) {
        if (!r.gender || r.gender === 'ANY' || r.gender.toLowerCase() === gender) {
          if (r.textNormal) expectedNormal = r.textNormal;
          if (expectedNormal) break;
        }
      }

      const comparisons = parameterLogic.comparisons || [];
      if (comparisons.length > 0) {
        result.rangeDisplay = comparisons.map(r => `${r.operator} ${r.value}: ${r.classification || ''}`).join('\n');
        for (const rule of comparisons) {
          if (matchesTextRule(textValue, rule)) {
            result.classification = rule.classification || null;
            const action = (rule.action || 'NORMAL').toUpperCase();
            if (action === 'HIGHLIGHT') {
              result.isAbnormal = true;
              result.highlight = true;
            } else if (action === 'CRITICAL') {
              result.isAbnormal = true;
              result.highlight = true;
              result.critical = true;
            }
            break;
          }
        }
      } else if (expectedNormal) {
        result.rangeDisplay = `Expected: ${expectedNormal}`;
        if (textValue && textValue.toLowerCase() !== expectedNormal.toLowerCase()) {
          result.isAbnormal = true;
          result.highlight = true;
          result.classification = 'Abnormal';
        } else if (textValue) {
          result.classification = 'Normal';
        }
      }
      return result;
  }

  const ruleType = resolveRuleType(parameterLogic);

  switch (ruleType) {
    case 'MIN_MAX': {
      const nr = parameterLogic.normalRange;
      if (!nr) break;
      result.rangeDisplay = formatMinMax(nr.min, nr.max, units);
      const abnormal = isOutsideBounds(numericValue, nr.min, nr.max);
      if (abnormal === true) {
        result.isAbnormal = true;
        result.highlight = true;
        result.classification = numericValue < nr.min ? 'Low' : 'High';
      } else if (abnormal === false) {
        result.classification = 'Normal';
      }
      break;
    }

    case 'GENDER_SPECIFIC': {
      const nr = parameterLogic.normalRange;
      if (!nr) break;

      const m = nr.male;
      const f = nr.female;

      // Evaluate against the patient's gender-specific range
      let targetRange = null;
      if ((gender === 'male' || gender === 'm') && m) {
        targetRange = m;
        result.rangeDisplay = formatMinMax(m.min, m.max, units);
      } else if ((gender === 'female' || gender === 'f') && f) {
        targetRange = f;
        result.rangeDisplay = formatMinMax(f.min, f.max, units);
      } else {
        const maleRange = (m && m.min != null && m.max != null) ? `Male: ${m.min}-${m.max} ${units}` : '';
        const femaleRange = (f && f.min != null && f.max != null) ? `Female: ${f.min}-${f.max} ${units}` : '';
        result.rangeDisplay = [maleRange, femaleRange].filter(r => r).join('\n');
      }

      if (targetRange) {
        const abnormal = isOutsideBounds(numericValue, targetRange.min, targetRange.max);
        if (abnormal === true) {
          result.isAbnormal = true;
          result.highlight = true;
          result.classification = numericValue < targetRange.min ? 'Low' : 'High';
        } else if (abnormal === false) {
          result.classification = 'Normal';
        }
      }
      break;
    }

    case 'THRESHOLD_COMPARISON': {
      const comparisons = parameterLogic.comparisons || [];
      if (comparisons.length === 0) break;

      // Build display string from all rules
      result.rangeDisplay = comparisons.map(r => formatRuleDisplay(r)).join('\n');

      // Find first matching rule (order matters)
      for (const rule of comparisons) {
        if (matchesRule(numericValue, rule)) {
          result.classification = rule.classification || null;
          const action = (rule.action || 'NORMAL').toUpperCase();
          if (action === 'HIGHLIGHT') {
            result.isAbnormal = true;
            result.highlight = true;
          } else if (action === 'CRITICAL') {
            result.isAbnormal = true;
            result.highlight = true;
            result.critical = true;
          }
          break;
        }
      }
      break;
    }
  }

  return result;
}

module.exports = { evaluatePatientResult, resolveRuleType, parseNumericResult };
