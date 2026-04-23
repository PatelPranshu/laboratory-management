/**
 * Test script for evaluatePatientResult()
 * Run: node backend/test-evaluator.js
 */

const { evaluatePatientResult } = require('./utils/resultEvaluator');

let passed = 0;
let failed = 0;

function assert(testName, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (pass) {
    passed++;
    console.log(`  ✓ ${testName}`);
  } else {
    failed++;
    console.log(`  ✗ ${testName}`);
    console.log(`    Expected: ${JSON.stringify(expected)}`);
    console.log(`    Actual:   ${JSON.stringify(actual)}`);
  }
}

// ===================== MIN_MAX Tests =====================
console.log('\n--- MIN_MAX Rule Type ---');

const minMaxParam = {
  ruleType: 'MIN_MAX',
  units: 'g/dL',
  normalRange: { min: 12, max: 16 }
};

let r = evaluatePatientResult('14', minMaxParam, 'Male');
assert('Normal value', r.isAbnormal, false);
assert('Normal classification', r.classification, 'Normal');
assert('Range display', r.rangeDisplay, '12-16 g/dL');

r = evaluatePatientResult('10', minMaxParam, 'Male');
assert('Low value is abnormal', r.isAbnormal, true);
assert('Low classification', r.classification, 'Low');
assert('Low highlight', r.highlight, true);

r = evaluatePatientResult('18.5', minMaxParam, 'Male');
assert('High value is abnormal', r.isAbnormal, true);
assert('High classification', r.classification, 'High');

r = evaluatePatientResult(null, minMaxParam, 'Male');
assert('Null value not abnormal', r.isAbnormal, false);

r = evaluatePatientResult('abc', minMaxParam, 'Male');
assert('Non-numeric not abnormal', r.isAbnormal, false);

// ===================== GENDER_SPECIFIC Tests =====================
console.log('\n--- GENDER_SPECIFIC Rule Type ---');

const genderParam = {
  ruleType: 'GENDER_SPECIFIC',
  units: 'g/dL',
  normalRange: {
    male: { min: 13, max: 17 },
    female: { min: 12, max: 15 }
  }
};

r = evaluatePatientResult('14', genderParam, 'Male');
assert('Male normal', r.isAbnormal, false);

r = evaluatePatientResult('11', genderParam, 'Male');
assert('Male low', r.isAbnormal, true);

r = evaluatePatientResult('14', genderParam, 'Female');
assert('Female normal', r.isAbnormal, false);

r = evaluatePatientResult('16', genderParam, 'Female');
assert('Female high', r.isAbnormal, true);

// ===================== Legacy isGenderSpecific =====================
console.log('\n--- Legacy isGenderSpecific Boolean ---');

const legacyParam = {
  isGenderSpecific: true,
  units: 'g/dL',
  normalRange: {
    male: { min: 13, max: 17 },
    female: { min: 12, max: 15 }
  }
};

r = evaluatePatientResult('11', legacyParam, 'Male');
assert('Legacy boolean maps to GENDER_SPECIFIC', r.isAbnormal, true);

r = evaluatePatientResult('14', legacyParam, 'Female');
assert('Legacy boolean female normal', r.isAbnormal, false);

// ===================== THRESHOLD_COMPARISON Tests =====================
console.log('\n--- THRESHOLD_COMPARISON Rule Type ---');

const thresholdParam = {
  ruleType: 'THRESHOLD_COMPARISON',
  units: 'mg/dL',
  comparisons: [
    { operator: '<', value: 200, classification: 'Desirable', action: 'NORMAL' },
    { operator: 'between', value: 200, valueTo: 239, classification: 'Borderline High', action: 'HIGHLIGHT' },
    { operator: '>=', value: 240, classification: 'High', action: 'CRITICAL' }
  ]
};

r = evaluatePatientResult('180', thresholdParam, 'Male');
assert('Below 200 is Desirable', r.classification, 'Desirable');
assert('Desirable is not abnormal', r.isAbnormal, false);
assert('Desirable no highlight', r.highlight, false);

r = evaluatePatientResult('215', thresholdParam, 'Male');
assert('215 is Borderline High', r.classification, 'Borderline High');
assert('Borderline is abnormal', r.isAbnormal, true);
assert('Borderline is highlighted', r.highlight, true);
assert('Borderline is not critical', r.critical, false);

r = evaluatePatientResult('250', thresholdParam, 'Male');
assert('250 is High', r.classification, 'High');
assert('High is abnormal', r.isAbnormal, true);
assert('High is critical', r.critical, true);

// Test with == operator
const eqParam = {
  ruleType: 'THRESHOLD_COMPARISON',
  comparisons: [
    { operator: '==', value: 0, classification: 'Negative', action: 'NORMAL' },
    { operator: '>', value: 0, classification: 'Positive', action: 'HIGHLIGHT' }
  ]
};

r = evaluatePatientResult('0', eqParam, 'Male');
assert('== 0 matches Negative', r.classification, 'Negative');

r = evaluatePatientResult('1', eqParam, 'Male');
assert('> 0 matches Positive', r.classification, 'Positive');

// ===================== Edge Cases =====================
console.log('\n--- Edge Cases ---');

r = evaluatePatientResult('14', null, 'Male');
assert('Null param returns safe default', r.isAbnormal, false);

r = evaluatePatientResult('14', { ruleType: 'MIN_MAX' }, 'Male');
assert('No normalRange returns safe default', r.isAbnormal, false);

const emptyThreshold = { ruleType: 'THRESHOLD_COMPARISON', comparisons: [] };
r = evaluatePatientResult('100', emptyThreshold, 'Male');
assert('Empty comparisons returns safe default', r.isAbnormal, false);

// ===================== Summary =====================
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(40)}\n`);

process.exit(failed > 0 ? 1 : 0);
