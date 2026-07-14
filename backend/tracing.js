const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { resourceFromAttributes } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');

// Datadog OTLP Intake
const url = process.env.DD_SITE 
  ? `https://otlp.${process.env.DD_SITE}/v1/traces`
  : 'https://otlp.datadoghq.com/v1/traces';

const traceExporter = new OTLPTraceExporter({
  url,
  headers: {
    'DD-API-KEY': process.env.DD_API_KEY
  }
});

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [SemanticResourceAttributes.SERVICE_NAME]: 'mypatholabs-server',
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'production',
    [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
  }),
  traceExporter,
  instrumentations: [getNodeAutoInstrumentations()]
});

sdk.start();
