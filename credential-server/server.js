var argo = require('argo');
var router = require('argo-url-router');
var urlHelper = require('argo-url-helper');
var resource = require('argo-resource');
var CredentialResource = require('./credential_resource');

var ConnectionString = 'postgres://admin1:Testpassword1@test.cu5mxtwkjjqu.us-east-1.rds.amazonaws.com/credentials';


argo()
  .use(urlHelper)
  .use(router)
  .use(resource(CredentialResource, ConnectionString))
  .listen(1338);

