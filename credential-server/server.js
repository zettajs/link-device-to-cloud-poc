// Copyright 2018 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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

