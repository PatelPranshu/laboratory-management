const ReportTemplate = require('../models/ReportTemplate');
const { pickFields } = require('../middlewares/validate');

// Allowed fields for template create/update
const TEMPLATE_FIELDS = ['templateName', 'department', 'reportType', 'sections'];

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
