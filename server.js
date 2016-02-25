var url = require('url');
var http = require('http');
var mosca = require('mosca');

var moscaSettings = {
  port: 1883
};

var Devices = [
  { username: 'zetta-target', password: '12345', isTarget: true },
  { id: '1234566', username: 'test', password: 'abc', tenantId: '', targets: [] },
  { id: '9349383', username: 'test2', password: 'abc', tenantId: '', targets: [] }
];

var Targets = [
  { tenantId: '', targetUrl: 'http://localhost:1337' }
];

function authenticate(client, username, password, callback) {
  var device = Devices.filter(function(device) {
    return (device.username === username && device.password === password.toString());
  })[0];

  if (!device) {
    return callback(null, false);
  }

  if (device.isTarget) {
    return callback(null, true);
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
  
  var targets = Targets.filter(function(target) {
    return target.tenantId === device.tenantId;
  });

  initDeviceOnTarget(targets[0].targetUrl, device.id, function(err) {
    if (err) {
      console.error(err);
      return callback(err);
    }
    callback(null, true);    
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
server.on('ready', function() {
  server.authenticate = authenticate;
  console.log('started');
});

server.on('clientConnected', function(client) {
  console.log('client connected', client.id);
});

server.on('published', function (packet, client) {
  console.log("Published :=", packet.topic);
});

server.on('subscribed', function (topic, client) {
  console.log("Subscribed :=", topic);
});

server.on('unsubscribed', function (topic, client) {
  console.log('unsubscribed := ', client.id, topic);
});

