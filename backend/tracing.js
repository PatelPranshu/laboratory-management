require('dotenv').config();

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { resourceFromAttributes } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { ParentBasedSampler, TraceIdRatioBasedSampler } = require('@opentelemetry/sdk-trace-base');

// Datadog OTLP Intake (Only instantiate if DD_API_KEY is present to avoid unauthorized traffic)
const url = process.env.DD_SITE 
  ? `https://otlp.${process.env.DD_SITE}/v1/traces`
  : 'https://otlp.datadoghq.com/v1/traces';

const traceExporter = process.env.DD_API_KEY
  ? new OTLPTraceExporter({
      url,
      compression: 'gzip',
      headers: {
        'DD-API-KEY': process.env.DD_API_KEY
      }
    })
  : undefined;

const parsedRatio = parseFloat(process.env.TRACE_SAMPLE_RATE || '0.1');
const sampleRatio = isNaN(parsedRatio) ? 0.1 : Math.max(0, Math.min(1, parsedRatio));

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [SemanticResourceAttributes.SERVICE_NAME]: 'mypatholabs-server',
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'production',
    [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
  }),
  sampler: new ParentBasedSampler({
    root: new TraceIdRatioBasedSampler(sampleRatio)
  }),
  traceExporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-dns': { enabled: false },
      '@opentelemetry/instrumentation-net': { enabled: false },
      '@opentelemetry/instrumentation-http': {
        ignoreIncomingRequestHook: (req) => {
          const path = req.url ? req.url.split('?')[0] : '';
          return path === '/health' || path === '/';
        },
        ignoreOutgoingRequestHook: (request) => {
          const host = request.host || request.hostname || '';
          return typeof host === 'string' && host.includes('datadoghq.com');
        }
      }
    })
  ]
});

sdk.start();

// Flush remaining telemetry on graceful termination
const flushTelemetry = () => {
  sdk.shutdown().catch(() => {});
};
process.once('SIGTERM', flushTelemetry);
process.once('SIGINT', flushTelemetry);
