var argo = require('argo');
var router = require('argo-url-router');
var urlHelper = require('argo-url-helper');
var resource = require('argo-resource');
var CredentialResource = require('./credential_resource');

argo()
  .use(urlHelper)
  .use(router)
  .use(resource(CredentialResource))
  .listen(1338);

