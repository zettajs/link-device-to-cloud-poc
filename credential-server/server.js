var argo = require('argo');
var router = require('argo-url-router');
var urlHelper = require('argo-url-helper');
var resource = require('argo-resource');
var CredentialResource = require('./credential_resource');

var ConnectionString = process.env.DB_CONNECTION_URL;

argo()
  .use(urlHelper)
  .use(router)
  .use(resource(CredentialResource, ConnectionString))
  .listen(process.env.PORT || 1338);

