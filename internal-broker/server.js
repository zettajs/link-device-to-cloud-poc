var url = require('url');
var mosca = require('mosca');

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

var moscaSettings = {
  port: Number(process.env.PORT) || 2883,
  backend: rabbitmqSettings
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
