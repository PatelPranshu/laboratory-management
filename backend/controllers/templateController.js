const crypto = require('crypto');
const ReportTemplate = require('../models/ReportTemplate');
const SharedBundle = require('../models/SharedBundle');
const { pickFields } = require('../middlewares/validate');

// Allowed fields for template create/update
const TEMPLATE_FIELDS = ['templateName', 'department', 'reportType', 'sections'];

const unescapeOperators = (sections) => {
  if (!sections || !Array.isArray(sections)) return;
  sections.forEach(sec => {
    if (sec.parameters && Array.isArray(sec.parameters)) {
      sec.parameters.forEach(param => {
        if (param.comparisons && Array.isArray(param.comparisons)) {
          param.comparisons.forEach(cmp => {
            if (typeof cmp.operator === 'string') {
              cmp.operator = cmp.operator
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>');
            }
          });
        }
      });
    }
  });
};

const validateTemplatePayload = (sections) => {
  if (!sections) return null;
  for (const section of sections) {
    for (const param of section.parameters || []) {
      if (param.dataType === 'CALCULATED') {
        // CALCULATED params must have a formula
        if (!param.formula || !param.formula.trim()) {
          return `Parameter '${param.name}' is CALCULATED but missing a formula.`;
        }
        // CALCULATED params also require reference ranges (like NUMERIC) for abnormality flagging
        const hasLegacyMinMax = param.normalRange && (param.normalRange.min != null || param.normalRange.max != null || (param.normalRange.male && (param.normalRange.male.min != null || param.normalRange.male.max != null)) || (param.normalRange.female && (param.normalRange.female.min != null || param.normalRange.female.max != null)));
        const hasLegacyComparisons = param.comparisons && param.comparisons.length > 0;
        const hasNewRanges = param.referenceRanges && param.referenceRanges.length > 0 && param.referenceRanges.some(r => r.min != null || r.max != null);
        if (!hasLegacyMinMax && !hasLegacyComparisons && !hasNewRanges) {
          return `Parameter '${param.name}' is CALCULATED but missing reference range limits.`;
        }
      } else if (param.dataType === 'NUMERIC') {
        const hasLegacyMinMax = param.normalRange && (param.normalRange.min != null || param.normalRange.max != null || (param.normalRange.male && (param.normalRange.male.min != null || param.normalRange.male.max != null)) || (param.normalRange.female && (param.normalRange.female.min != null || param.normalRange.female.max != null)));
        const hasLegacyComparisons = param.comparisons && param.comparisons.length > 0;
        const hasNewRanges = param.referenceRanges && param.referenceRanges.length > 0 && param.referenceRanges.some(r => r.min != null || r.max != null);
        if (!hasLegacyMinMax && !hasLegacyComparisons && !hasNewRanges) {
          return `Parameter '${param.name}' is NUMERIC but missing limits.`;
        }
      } else if (param.dataType === 'TEXT') {
        const hasLegacyComparisons = param.comparisons && param.comparisons.length > 0;
        const hasNewText = param.referenceRanges && param.referenceRanges.length > 0 && param.referenceRanges.some(r => r.textNormal);
        if (!hasLegacyComparisons && !hasNewText) {
          return `Parameter '${param.name}' is TEXT but missing expected text limit.`;
        }
      }
    }
  }
  return null;
};

// @desc    Get all templates
// @route   GET /api/templates
// @access  Private
exports.getTemplates = async (req, res) => {
    const doctorId = req.user.role === 'LabTech' ? req.user.parentAdminId : req.user.id;
    const templates = await ReportTemplate.find({ doctorId })
      .collation({ locale: 'en' })
      .sort({ usageCount: -1, templateName: 1 });

    res.status(200).json({ success: true, count: templates.length, data: templates });
  };

// @desc    Get single template
// @route   GET /api/templates/:id
// @access  Private
exports.getTemplate = async (req, res) => {
    const doctorId = req.user.role === 'LabTech' ? req.user.parentAdminId : req.user.id;
    const template = await ReportTemplate.findOne({ _id: req.params.id, doctorId });

    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    res.status(200).json({ success: true, data: template });
  };

// @desc    Create template
// @route   POST /api/templates
// @access  Private (Doctor only — enforced by route middleware)
exports.createTemplate = async (req, res) => {
    // Whitelist fields FIRST, then set doctorId
    const sanitizedBody = pickFields(req.body, TEMPLATE_FIELDS);
    sanitizedBody.doctorId = req.user.id;

    unescapeOperators(sanitizedBody.sections);

    const validationError = validateTemplatePayload(sanitizedBody.sections);
    if (validationError) {
      return res.status(400).json({ success: false, error: validationError });
    }

    const template = await ReportTemplate.create(sanitizedBody);
    res.status(201).json({ success: true, data: template });
  };

// @desc    Update template
// @route   PUT /api/templates/:id
// @access  Private (Doctor only)
exports.updateTemplate = async (req, res) => {
    let template = await ReportTemplate.findOne({ _id: req.params.id, doctorId: req.user.id });

    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    // Whitelist fields — prevent mass assignment
    const sanitizedBody = pickFields(req.body, TEMPLATE_FIELDS);

    unescapeOperators(sanitizedBody.sections);

    const validationError = validateTemplatePayload(sanitizedBody.sections);
    if (validationError) {
      return res.status(400).json({ success: false, error: validationError });
    }

    template = await ReportTemplate.findByIdAndUpdate(req.params.id, sanitizedBody, {
      returnDocument: 'after',
      runValidators: true
    });

    res.status(200).json({ success: true, data: template });
  };

// @desc    Delete template
// @route   DELETE /api/templates/:id
// @access  Private (Doctor only)
exports.deleteTemplate = async (req, res) => {
    const template = await ReportTemplate.findOne({ _id: req.params.id, doctorId: req.user.id });

    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    await template.deleteOne();

    res.status(200).json({ success: true, data: {} });
  };

// Recursive function to deep clone template and strip internal Mongoose IDs
const deepCloneTemplate = (obj) => {
  if (Array.isArray(obj)) {
    return obj.map(item => deepCloneTemplate(item));
  } else if (obj !== null && typeof obj === 'object') {
    if (obj instanceof Date) return new Date(obj.getTime());
    
    const clone = {};
    for (const key in obj) {
      if (key === '_id' || key === 'id' || key === '__v' || key === 'createdAt' || key === 'updatedAt' || key === 'doctorId') {
        continue;
      }
      clone[key] = deepCloneTemplate(obj[key]);
    }
    return clone;
  }
  return obj;
};

// @desc    Generate a share code for templates
// @route   POST /api/templates/share/generate
// @access  Private
exports.generateShare = async (req, res) => {
    const { templateIds } = req.body;
    if (!templateIds || !Array.isArray(templateIds) || templateIds.length === 0) {
      const err = new Error('Please provide an array of templateIds');
      err.statusCode = 400;
      throw err;
    }

    let shareCode;
    let bundle;
    let attempts = 0;
    
    while (attempts < 3) {
      shareCode = crypto.randomBytes(4).toString('hex').toUpperCase();
      try {
        bundle = await SharedBundle.create({
          shareCode,
          senderId: req.user.id,
          templateIds
        });
        break; // Successfully created
      } catch (err) {
        if (err.code === 11000) {
          attempts++;
        } else {
          throw err;
        }
      }
    }

    if (!bundle) {
      const err = new Error('Failed to generate a unique share code. Please try again.');
      err.statusCode = 500;
      throw err;
    }

    res.status(201).json({ success: true, data: bundle });
};

// @desc    Get active shared bundles created by the user
// @route   GET /api/templates/share/active
// @access  Private
exports.getActiveShares = async (req, res) => {
    const bundles = await SharedBundle.find({ senderId: req.user.id })
      .populate('templateIds', 'templateName department')
      .populate('importedBy.user', 'name email labName')
      .sort('-createdAt');

    res.status(200).json({ success: true, count: bundles.length, data: bundles });
  };

// @desc    Revoke/Delete an active share
// @route   DELETE /api/templates/share/:id
// @access  Private
exports.revokeShare = async (req, res) => {
    const bundle = await SharedBundle.findOne({ _id: req.params.id, senderId: req.user.id });

    if (!bundle) {
      return res.status(404).json({ success: false, error: 'Share bundle not found or unauthorized' });
    }

    await bundle.deleteOne();
    res.status(200).json({ success: true, data: {} });
  };

// @desc    Preview a shared bundle
// @route   GET /api/templates/share/preview/:code
// @access  Private
exports.previewShare = async (req, res) => {
    const code = req.params.code.toUpperCase();
    const bundle = await SharedBundle.findOne({ shareCode: code })
      .populate('senderId', 'name labName')
      .populate('templateIds', 'templateName department');

    if (!bundle) {
      return res.status(404).json({ success: false, error: 'Invalid or expired share code' });
    }

    res.status(200).json({ success: true, data: bundle });
  };

// @desc    Import templates from a shared bundle
// @route   POST /api/templates/share/import
// @access  Private
exports.importShare = async (req, res) => {
    const { shareCode } = req.body;
    if (!shareCode) {
      return res.status(400).json({ success: false, error: 'Please provide a share code' });
    }

    const code = shareCode.toUpperCase();
    const bundle = await SharedBundle.findOne({ shareCode: code });

    if (!bundle) {
      return res.status(404).json({ success: false, error: 'Invalid or expired share code' });
    }

    if (bundle.senderId.toString() === req.user.id.toString()) {
      return res.status(400).json({ success: false, error: 'Cannot import your own shared templates' });
    }

    // Check if already imported
    const alreadyImported = bundle.importedBy.some(imp => imp.user.toString() === req.user.id.toString());
    if (alreadyImported) {
      return res.status(400).json({ success: false, error: 'You have already imported this shared bundle' });
    }

    const templatesToImport = await ReportTemplate.find({ _id: { $in: bundle.templateIds } }).lean();
    
    if (templatesToImport.length === 0) {
      return res.status(404).json({ success: false, error: 'No templates found in this bundle' });
    }

    const newTemplates = templatesToImport.map(t => {
      const cloned = deepCloneTemplate(t);
      cloned.doctorId = req.user.id;
      return cloned;
    });

    const inserted = await ReportTemplate.insertMany(newTemplates);

    bundle.importedBy.push({
      user: req.user.id,
      labName: req.user.labName
    });
    await bundle.save();

    res.status(201).json({ success: true, count: inserted.length, data: inserted });
  };
