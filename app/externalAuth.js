const ExternalAuthModels = process.env.EXTERNAL_AUTH_MODELS ? JSON.parse(process.env.EXTERNAL_AUTH_MODELS) : {};

console.log( `PLC EXTERNAL_AUTH_MODELS: ${process.env.EXTERNAL_AUTH_MODELS}`);
console.log( `PLC External Auth Models: ${JSON.stringify(ExternalAuthModels, null, 4)}` );

module.exports = {
  ExternalAuthModels: ExternalAuthModels
}
