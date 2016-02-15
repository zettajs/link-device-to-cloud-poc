var mosca = require('mosca');

var moscaSettings = {
  port: 1883
};

var Devices = [
  { username: 'zetta-target', password: '12345', isTarget: true },
  { id: '1234566', username: 'test', password: 'abc', tenant: '', targets: [] },
  { id: '9349383', username: 'test2', password: 'abc', tenant: '', targets: [] }
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

  // Pick target to have the device initialized on
  //  - Could look at etcd targets and call some http command on device.
  //  - Could look at connected mqtt zetta targets and send publish

  callback(null, true);
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
  console.log("Published :=", packet);
});

server.on('subscribed', function (topic, client) {
  console.log("Subscribed :=", client.packet);
});

server.on('unsubscribed', function (topic, client) {
  console.log('unsubscribed := ', topic);
});

