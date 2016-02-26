var argo = require('argo');
var router = require('argo-url-router');
var resource = require('argo-resource');
var CredentialResource = require('./credential_resource');

argo()
  .use(router)
  .use(resource(CredentialResource))
  .listen(1337);

