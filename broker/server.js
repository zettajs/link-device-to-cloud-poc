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

var opts = {
  host: process.env.COREOS_PRIVATE_IPV4
};

// allow a list of peers to be passed, overides COREOS_PRIVATE_IPV4
if (process.env.ETCD_PEER_HOSTS) {
  opts.host = process.env.ETCD_PEER_HOSTS.split(',');
}

var serviceRegistryClient = new ServiceRegistryClient(opts);
var routerClient = new RouterClient(opts);
var versionClient = new VersionClient(opts);

var targetMonitor = new MonitorService(serviceRegistryClient, { 
  disabled: (process.env.DISABLE_TARGET_MONITOR) ? true : false
});

var proxy = new Proxy(serviceRegistryClient, routerClient, versionClient, targetMonitor);

var rabbitmqSettings = {
  type: 'amqp',
  json: false,
  amqp: require('amqp'),
  exchange: 'ascolatore5672'
};

var moscaSettings = {
  port: 1884,
  backend: rabbitmqSettings
};

var targetKey = {
  username: 'zetta-target',
  password: '12345'
};

var KeepAlive = {
  min: 15,
  max: 720
};

function authenticateWithApi(username, password, callback) {
  var parsed = url.parse(process.env.AUTH_API || 'http://localhost:1338');
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
  // Check if client is a zetta-target
  if (password) {
    password = password.toString();
  } else {
    return callback(null, false);
  }
  
  if (username === targetKey.username && password === targetKey.password) {
    return callback(null, true);
  }
  
  authenticateWithApi(username, password, function(err, device) {
    if (err) {
      return callback(null, false);
    }

    client.deviceId = device.id;
    client.tenantId = device.tenantId;

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

    proxy._targetAllocation.lookup(device.tenantId, function(err, serverUrl) {
      if (err) {
        console.error('Peer Socket Failed to allocate target:', err);
        return callback(err);
      }
      
      if (!serverUrl) {
        console.error('No targets available for tenant:', device.tenantId);
        return callback(new Error('No targets available.'));
      }

      initDeviceOnTarget(serverUrl, device.id, function(err) {
        if (err) {
          console.error(err);
          return callback(err);
        }

        server.zettaUUIDMapping[device.id] = client.id;
        
        // Add device to router client.
        proxy._routerClient.add(device.tenantId, device.id, serverUrl, true, function(err) {

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

server.on('published', function (packet, client) {
//  console.log("Published :=", packet.topic);
});

server.on('subscribed', function (topic, client) {
//  console.log("Subscribed :=", topic);
});

server.on('unsubscribed', function (topic, client) {
//  console.log('unsubscribed := ', client.id, topic);
});

server.on('clientDisconnected', function(client) {
  if (client.deviceId) {
    var packet = {
      topic: 'device/' + client.deviceId + '/$disconnect',
      payload: '' 
    };

    server.publish(packet);
    proxy._routerClient.remove(client.tenantId, client.deviceId, true, function() {});

    delete server.zettaUUIDMapping[client.deviceId];
  } else {
    proxy._serviceRegistryClient.get(client.id, function(err, target) {
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
      
      proxy._routerClient.findAll(target.tenantId, function(err, devices) {
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
    })
  }
});
