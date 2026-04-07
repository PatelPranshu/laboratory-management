const ReportTemplate = require('../models/ReportTemplate');
const { pickFields } = require('../middlewares/validate');

// Allowed fields for template create/update
const TEMPLATE_FIELDS = ['templateName', 'sections'];

// @desc    Get all templates
// @route   GET /api/templates
// @access  Private
exports.getTemplates = async (req, res) => {
  try {
    const doctorId = req.user.role === 'LabTech' ? req.user.parentDoctorId : req.user.id;
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
    const doctorId = req.user.role === 'LabTech' ? req.user.parentDoctorId : req.user.id;
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
