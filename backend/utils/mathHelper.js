/**
 * mathHelper.js
 * 
 * Secure formula evaluation engine for calculated parameters.
 * Uses mathjs library for safe, sandboxed math expression evaluation.
 * 
 * SECURITY: This module intentionally avoids eval(), new Function(),
 * and setTimeout for formula parsing. mathjs provides a safe sandbox
 * that prevents access to the Node.js runtime, filesystem, or network.
 */

const { evaluate } = require('mathjs');

/**
 * Extracts all bracketed tag names from a formula string.
 * E.g., "[Total Cholesterol] - [HDL]" → ["Total Cholesterol", "HDL"]
 * 
 * @param {string} formula - The formula string containing [Tag Name] references
 * @returns {string[]} Array of tag names (without brackets)
 */
function extractTags(formula) {
  if (!formula || typeof formula !== 'string') return [];
  const matches = formula.match(/\[([^\]]+)\]/g);
  if (!matches) return [];
  return matches.map(m => m.slice(1, -1));
}

/**
 * Converts a tag name to a valid mathjs variable name.
 * Replaces spaces, hyphens, and other invalid characters with underscores.
 * 
 * @param {string} tagName - The human-readable tag name
 * @returns {string} A valid mathjs variable identifier
 */
function tagToVariable(tagName) {
  return tagName
    .replace(/[^a-zA-Z0-9_]/g, '_')  // Replace non-alphanumeric chars with underscores
    .replace(/^(\d)/, '_$1')          // Prefix with underscore if starts with a digit
    .replace(/_+/g, '_');             // Collapse consecutive underscores
}

/**
 * Calculates a derived result from a formula using values from resultsMap and patientContext.
 * 
 * @param {string} formula - The formula string, e.g. "[Total Cholesterol] - [HDL] - [VLDL]"
 * @param {Object} resultsMap - Key-value map of parameter names to their numeric values
 *                              e.g. { "HDL": 40, "Total Cholesterol": 170 }
 * @param {Object} patientContext - Key-value map of patient demographics
 *                                  e.g. { "Patient Age": 35, "Patient Weight": 70 }
 * @returns {number|null} The calculated result rounded to 2 decimal places, or null on failure
 */
function calculateDerivedResult(formula, resultsMap = {}, patientContext = {}) {
  try {
    if (!formula || typeof formula !== 'string') return null;

    const tags = extractTags(formula);
    if (tags.length === 0) return null;

    // Build scope object and sanitized formula
    const scope = {};
    let sanitizedFormula = formula;

    for (const tag of tags) {
      const variableName = tagToVariable(tag);

      // Look up value: first in resultsMap, then in patientContext
      let rawValue = resultsMap[tag];
      if (rawValue === undefined || rawValue === null || rawValue === '') {
        rawValue = patientContext[tag];
      }

      // Convert to number
      const numericValue = parseFloat(rawValue);

      // If any dependency is missing or non-numeric, abort the entire calculation
      if (isNaN(numericValue)) {
        return null;
      }

      scope[variableName] = numericValue;

      // Replace the bracketed tag with the variable name in the formula
      // Use a literal string replacement (escape regex special chars in the tag)
      const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      sanitizedFormula = sanitizedFormula.replace(
        new RegExp(`\\[${escapedTag}\\]`, 'g'),
        variableName
      );
    }

    // Execute the formula using mathjs sandboxed evaluate
    const result = evaluate(sanitizedFormula, scope);

    // Validate the result is a finite number
    if (typeof result !== 'number' || !isFinite(result)) {
      return null;
    }

    // Round to 2 decimal places
    return Math.round(result * 100) / 100;
  } catch (error) {
    // Graceful failure: division by zero, invalid syntax, negative sqrt, etc.
    // The rest of the report continues processing normally
    console.warn('[mathHelper] Formula evaluation failed:', error.message);
    return null;
  }
}

module.exports = { calculateDerivedResult, extractTags, tagToVariable };
