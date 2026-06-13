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
      if (param.dataType === 'NUMERIC') {
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
  try {
    const doctorId = req.user.role === 'LabTech' ? req.user.parentAdminId : req.user.id;
    const templates = await ReportTemplate.find({ doctorId });

    res.status(200).json({ success: true, count: templates.length, data: templates });
  } catch (error) {
    console.error('getTemplates error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to retrieve templates' });
  }
};

// @desc    Get single template
// @route   GET /api/templates/:id
// @access  Private
exports.getTemplate = async (req, res) => {
  try {
    const doctorId = req.user.role === 'LabTech' ? req.user.parentAdminId : req.user.id;
    const template = await ReportTemplate.findOne({ _id: req.params.id, doctorId });

    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    res.status(200).json({ success: true, data: template });
  } catch (error) {
    console.error('getTemplate error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to retrieve template' });
  }
};

// @desc    Create template
// @route   POST /api/templates
// @access  Private (Doctor only — enforced by route middleware)
exports.createTemplate = async (req, res) => {
  try {
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
  } catch (error) {
    console.error('createTemplate error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to create template' });
  }
};

// @desc    Update template
// @route   PUT /api/templates/:id
// @access  Private (Doctor only)
exports.updateTemplate = async (req, res) => {
  try {
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
  } catch (error) {
    console.error('updateTemplate error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to update template' });
  }
};

// @desc    Delete template
// @route   DELETE /api/templates/:id
// @access  Private (Doctor only)
exports.deleteTemplate = async (req, res) => {
  try {
    const template = await ReportTemplate.findOne({ _id: req.params.id, doctorId: req.user.id });

    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    await template.deleteOne();

    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    console.error('deleteTemplate error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to delete template' });
  }
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
  try {
    const { templateIds } = req.body;
    if (!templateIds || !Array.isArray(templateIds) || templateIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Please provide an array of templateIds' });
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
        // 11000 is the MongoDB duplicate key error code
        if (err.code === 11000) {
          attempts++;
        } else {
          throw err;
        }
      }
    }

    if (!bundle) {
      return res.status(500).json({ success: false, error: 'Failed to generate a unique share code. Please try again.' });
    }

    res.status(201).json({ success: true, data: bundle });
  } catch (error) {
    console.error('generateShare error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to generate share code' });
  }
};

// @desc    Get active shared bundles created by the user
// @route   GET /api/templates/share/active
// @access  Private
exports.getActiveShares = async (req, res) => {
  try {
    const bundles = await SharedBundle.find({ senderId: req.user.id })
      .populate('templateIds', 'templateName department')
      .populate('importedBy.user', 'name email labName')
      .sort('-createdAt');

    res.status(200).json({ success: true, count: bundles.length, data: bundles });
  } catch (error) {
    console.error('getActiveShares error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch active shares' });
  }
};

// @desc    Revoke/Delete an active share
// @route   DELETE /api/templates/share/:id
// @access  Private
exports.revokeShare = async (req, res) => {
  try {
    const bundle = await SharedBundle.findOne({ _id: req.params.id, senderId: req.user.id });

    if (!bundle) {
      return res.status(404).json({ success: false, error: 'Share bundle not found or unauthorized' });
    }

    await bundle.deleteOne();
    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    console.error('revokeShare error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to revoke share' });
  }
};

// @desc    Preview a shared bundle
// @route   GET /api/templates/share/preview/:code
// @access  Private
exports.previewShare = async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const bundle = await SharedBundle.findOne({ shareCode: code })
      .populate('senderId', 'name labName')
      .populate('templateIds', 'templateName department');

    if (!bundle) {
      return res.status(404).json({ success: false, error: 'Invalid or expired share code' });
    }

    res.status(200).json({ success: true, data: bundle });
  } catch (error) {
    console.error('previewShare error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to preview share' });
  }
};

// @desc    Import templates from a shared bundle
// @route   POST /api/templates/share/import
// @access  Private
exports.importShare = async (req, res) => {
  try {
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
  } catch (error) {
    console.error('importShare error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to import templates' });
  }
};
