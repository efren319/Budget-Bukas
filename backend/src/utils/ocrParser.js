// ============================================
// OCR Parser Utility
// Tesseract.js wrapper + receipt text parsing
// ============================================
const Tesseract = require('tesseract.js');
const path = require('path');

/**
 * Extract text from a receipt image using Tesseract.js
 * @param {string} imagePath - Path to the uploaded image
 * @returns {object} - { rawText, total, date, items }
 */
async function parseReceipt(imagePath) {
  try {
    // Run OCR
    const worker = await Tesseract.createWorker('eng');
    const { data } = await worker.recognize(imagePath);
    await worker.terminate();

    const rawText = data.text;
    
    // Parse extracted text
    const parsed = {
      rawText,
      total: extractTotal(rawText),
      date: extractDate(rawText),
      items: extractItems(rawText),
      confidence: data.confidence
    };

    return parsed;
  } catch (error) {
    console.error('OCR Error:', error);
    return {
      rawText: '',
      total: null,
      date: null,
      items: [],
      confidence: 0,
      error: error.message
    };
  }
}

/**
 * Extract total amount from receipt text
 * Looks for common patterns: TOTAL, AMOUNT DUE, GRAND TOTAL, etc.
 */
function extractTotal(text) {
  const patterns = [
    /(?:GRAND\s*TOTAL|TOTAL\s*(?:DUE|AMOUNT)?|AMOUNT\s*DUE|BALANCE\s*DUE|NET\s*AMOUNT)\s*[:\s]*[₱P$]?\s*([\d,]+\.?\d{0,2})/i,
    /(?:TOTAL)\s*[:\s]*[₱P$]?\s*([\d,]+\.?\d{0,2})/i,
    /[₱P$]\s*([\d,]+\.\d{2})\s*$/m
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      // Remove commas and parse to float
      return parseFloat(match[1].replace(/,/g, ''));
    }
  }

  return null;
}

/**
 * Extract date from receipt text
 * Handles multiple formats: MM/DD/YYYY, DD-MM-YYYY, Month DD YYYY, etc.
 */
function extractDate(text) {
  const patterns = [
    // MM/DD/YYYY or MM-DD-YYYY
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
    // YYYY-MM-DD
    /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/,
    // Month DD, YYYY
    /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/i,
    // DD Month YYYY
    /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{4})/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      try {
        const dateStr = match[0];
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
          return parsed.toISOString().split('T')[0]; // YYYY-MM-DD
        }
      } catch (e) {
        // Try next pattern
      }
    }
  }

  return null;
}

/**
 * Extract line items from receipt text
 * Looks for lines with an item description followed by an amount
 */
function extractItems(text) {
  const items = [];
  const lines = text.split('\n');

  for (const line of lines) {
    // Match lines that have text followed by an amount
    const match = line.match(/^(.+?)\s+[₱P$]?\s*([\d,]+\.\d{2})\s*$/);
    if (match) {
      const name = match[1].trim();
      const amount = parseFloat(match[2].replace(/,/g, ''));
      
      // Skip if name is a total-related keyword
      if (!/TOTAL|SUBTOTAL|TAX|DISCOUNT|CHANGE|CASH|AMOUNT|BALANCE/i.test(name)) {
        items.push({ name, amount });
      }
    }
  }

  return items;
}

module.exports = { parseReceipt };
