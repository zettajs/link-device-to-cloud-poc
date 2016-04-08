var url = require('url');
var http = require('http');
var mosca = require('mosca');
var getBody = require('./get_body');
var Proxy = require('./proxy');

var RouterClient = require('./etcd-clients/router_client');
var ServiceRegistryClient = require('./etcd-clients/service_registry_client');
var VersionClient = require('./etcd-clients/version_client')
var MonitorService = require('./target-monitor/service');

var DisconnectDeviceTopic = '$disconnect-device';

// Keep a list of clients with their timers that wait to remove
// the device from etcd after the DESTROY_TIMEOUT if client reconnects cancel previous one.
var DESTROY_TIMEOUT = process.env.MQTT_DESTROY_TIMEOUT || 300000;
var destroyTimers = {}; // <clientId: client>

var etcdOpts = {
  host: process.env.COREOS_PRIVATE_IPV4
};
// allow a list of peers to be passed, overides COREOS_PRIVATE_IPV4
if (process.env.ETCD_PEER_HOSTS) {
  etcdOpts.host = process.env.ETCD_PEER_HOSTS.split(',');
}

var serviceRegistryClient = new ServiceRegistryClient(etcdOpts);
var routerClient = new RouterClient(etcdOpts);
var versionClient = new VersionClient(etcdOpts);

var targetMonitor = new MonitorService(serviceRegistryClient, { 
  disabled: (process.env.DISABLE_TARGET_MONITOR) ? true : false
});

var proxy = new Proxy(serviceRegistryClient, routerClient, versionClient, targetMonitor);

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
  port: Number(process.env.PORT) || 1883,
  backend: rabbitmqSettings
};

// Min and Max keep-alive times that can be set from client
var KeepAlive = {
  min: 15,
  max: 720
};

function authenticateWithApi(username, password, callback) {
  var parsed = url.parse(process.env.CREDENTIAL_API_URL || 'http://localhost:1338');
  var body = JSON.stringify({ username: username, password: password });
  
  var opts = {
    method: 'POST',
    host: parsed.hostname,
    port: parsed.port,
    path: '/authenticate',
    headers: {
      'Content-Length': body.length,
      'Content-Type': 'application/json'
    }
  };

  var req = http.request(opts, function(response) {
    if (response.statusCode !== 202) {
      return callback(new Error('Unauthorized'));
    }
    
    getBody(response, function(err, body) {
      if (err) {
        return callback(new Error('Failed to get body'));
      }
      var json = null;
      try {
        json = JSON.parse(body.toString());
      } catch(err) {
        return callback(new Error('Failed to get body'));
      }
      return callback(null, json.properties);
    });
  });

  req.on('error', callback);
  req.end(body);
}

function authenticate(client, username, password, callback) {

  if (!username) {
    return callback(null, false);
  }

  // Client.id must be the same as username
  if (client.id !== username) {
    return callback(null, false);
  }
  
  // Check if client is a zetta-target
  if (password) {
    password = password.toString();
  } else {
    return callback(null, false);
  }
  
  authenticateWithApi(username, password, function(err, device) {
    if (err) {
      return callback(null, false);
    }

    client.deviceId = device.id;
    client.tenantId = device.tenant;

    // Check if there is an active destroy timer
    if (destroyTimers[client.deviceId]) {
      // Stop old client's etcd refresh interval
      clearInterval(destroyTimers[client.deviceId]._etcdRefreshTimer);
      // Stop countdown to remove from etcd
      clearTimeout(destroyTimers[client.deviceId]._destroyTimer);
      delete destroyTimers[client.deviceId];
    }
    
    var devicePrefix = 'device/' + device.id + '/';
    
    var handleSubscribe = client.handleSubscribe;
    client.handleSubscribe = function(packet) {
      packet.subscriptions = packet.subscriptions.map(function(subscription) {
        subscription.topic = devicePrefix + subscription.topic;
        return subscription;
      });
      handleSubscribe.call(client, packet);
    };

    var handleAuthorizePublish = client.handleAuthorizePublish;
    client.handleAuthorizePublish = function(err, success, packet) {
      packet.topic = devicePrefix + packet.topic;
      handleAuthorizePublish.call(client, err, success, packet);
    };

    var forward = client.forward;
    client.forward = function(topic, payload, options, subTopic, qos, cb) {
      topic = topic.substr(devicePrefix.length);
      forward.call(client, topic, payload, options, subTopic, qos, cb);
    };

    // Pick target to have the device initialized on
    //  - Could look at etcd targets and call some http command on device.
    //  - Could look at connected mqtt zetta targets and send publish

    proxy._targetAllocation.lookup(device.tenant, function(err, serverUrl) {
      if (err) {
        console.error('Peer Socket Failed to allocate target:', err);
        return callback(err);
      }
      
      if (!serverUrl) {
        console.error('No targets available for tenant:', device.tenant);
        return callback(new Error('No targets available.'));
      }

      initDeviceOnTarget(serverUrl, device.id, function(err) {
        if (err) {
          console.error(err);
          return callback(err);
        }

        server.zettaUUIDMapping[device.id] = client.id;
        
        // Add device to router client.
        proxy._routerClient.add(device.tenant, device.id, serverUrl, true, function(err) {

          if (err) {
            console.error('Failed to add device to router.', err);
            return callback(err);
          }
          
          callback(null, true);

          // Make sure keepalive falls within allowed range
          // Note: Has to be setup after callback() is called.
          if (client.keepalive > KeepAlive.max) {
            client.keepalive = KeepAlive.max;
            client.setUpTimer();
          } else if (client.keepalive < KeepAlive.min) {
            client.keepalive = KeepAlive.min;
            client.setUpTimer();
          }
          
        });

        client._etcdRefreshTimer = setInterval(function() {
          proxy._routerClient.add(device.tenant, device.id, serverUrl, true, function(err) {});
        }, 60000);
        
      });
    });
    
  });
}


function initDeviceOnTarget(targetUrl, deviceId, callback) {
  var parsed = url.parse(targetUrl);
  var body = JSON.stringify({ id: deviceId });
  var opts = {
    hostname: parsed.hostname,
    port: parsed.port,
    path: '/mqtt',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': body.length
    }
  };
  var req = http.request(opts, function(res) {
    if (res.statusCode !== 201) {
      return callback(new Error('Failed allocating zetta target'));
    }
    return callback();
  });
  req.on('error', callback);
  req.end(body);
}

var authorizePublish = function (client, topic, payload, callback) {
  callback(null, true);
}

var authorizeSubscribe = function (client, topic, callback) {
  console.log('Authorize Subscribe:', client.id, topic);
  callback(null, true);
}

var server = new mosca.Server(moscaSettings);   //here we start mosca

server.zettaUUIDMapping = {}; // <uuid>: client.id

server.on('ready', function() {
  server.authenticate = authenticate;
  console.log('started');

  server.ascoltatore.subscribe(DisconnectDeviceTopic, function(topic, payload) {
    try {
      var device = JSON.parse(payload);
    } catch(err) {
      console.error(err);
      return;
    }
    
    var clientId = server.zettaUUIDMapping[device.name];
    if (!clientId) {
      return;
    }

    server.clients[clientId].close();
  });
});

server.on('clientConnected', function(client) {
  console.log('client connected', client.id);
});

server.on('clientDisconnected', function(client) {
  var packet = {
    topic: 'device/' + client.deviceId + '/$disconnect',
    payload: '' 
  };
  // Publish disconnect so zetta-target know
  server.publish(packet);
  
  // Remove from ectd after a given time
  destroyTimers[client.deviceId] = client;
  client._destroyTimer = setTimeout(function() {
    // Remove from etcd
    proxy._routerClient.remove(client.tenantId, client.deviceId, true, function() {});

    // Clear the etcd refresh timer
    clearInterval(client._etcdRefreshTimer);
    
    delete server.zettaUUIDMapping[client.deviceId];
    delete destroyTimers[client.deviceId];
  }, DESTROY_TIMEOUT);  
});
