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

var url = require('url');
var mosca = require('mosca');
var ascoltatori = require('ascoltatori');

var RouterClient = require('./etcd-clients/router_client');
var ServiceRegistryClient = require('./etcd-clients/service_registry_client');

var DisconnectDeviceTopic = '$disconnect-device';

var opts = {
  host: process.env.COREOS_PRIVATE_IPV4
};

// allow a list of peers to be passed, overides COREOS_PRIVATE_IPV4
if (process.env.ETCD_PEER_HOSTS) {
  opts.host = process.env.ETCD_PEER_HOSTS.split(',');
}

var serviceRegistryClient = new ServiceRegistryClient(opts);
var routerClient = new RouterClient(opts);

var brokerUrl = url.parse(process.env.BROKER_URL);
var rabbitmqSettings = {
  type: 'amqp',
  json: false,
  amqp: require('amqp'),
  exchange: 'ascolatore5672',
  client: {
    host: brokerUrl.hostname,
    port: brokerUrl.port
  }
};

ascoltatori.build(rabbitmqSettings, function (err, ascoltatore) {
  if (err) {
    throw err;
  }

  ascoltatore.on('error', function(err) {
    console.error('ascoltatori error:', err);
  });

  var moscaSettings = {
    port: Number(process.env.PORT) || 2883,
    ascoltatore: ascoltatore
  };

  var server = new mosca.Server(moscaSettings);   //here we start mosca

  server.on('ready', function() {
    console.log('Server Ready');
  });

  server.on('clientDisconnected', function(client) {
    serviceRegistryClient.get(client.id, function(err, target) {
      if (err) {
        console.error(err);
        return;
      }

      if (!target) {
        console.error('Did not find', client.id, 'in /services/zetta');
        return;
      }

      if (target.tenantId === undefined) {
        console.error(client.id, 'Does not have tenantId');
        return;
      }
      
      routerClient.findAll(target.tenantId, function(err, devices) {
        if (err) {
          console.error(err);
          return;
        }

        devices.filter(function(device) {
          // Filter out devices only connected to disconnected target
          return 'http://' + client.id === device.url;
        }).forEach(function(device) {
          // Tell all brokers to disconnect device with name
          var packet = {
            topic: DisconnectDeviceTopic,
            payload: JSON.stringify(device)
          };

          server.publish(packet);
        });
      })
    });
  });

});
