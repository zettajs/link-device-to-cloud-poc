var url = require('url');
var http = require('http');
var mosca = require('mosca');
var getBody = require('./get_body');

var moscaSettings = {
  port: 1883
};

var Targets = [
  { tenantId: 'default', targetUrl: 'http://localhost:1337' }
];

var targetKey = {
  username: 'zetta-target',
  password: '12345'
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
  password = password.toString();
  
  if (username === targetKey.username && password === targetKey.password) {
    return callback(null, true);
  }
  
  authenticateWithApi(username, password, function(err, device) {
    client.deviceId = device.id;
    if (err) {
      return callback(null, false);
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

server.on('clientDisconnected', function(client) {
  if(client.deviceId) {
    var packet = {
      topic: 'device/' + client.deviceId + '/$disconnect',
      payload: '' 
    };

    server.publish(packet);
  }
});
