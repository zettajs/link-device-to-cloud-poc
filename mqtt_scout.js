var util = require('util');
var Scout = require('zetta').Scout;
var mqtt = require('mqtt');
var MqttClient = require('./mqtt_client');
var MqttDriver = require('./mqtt_device');
var DiscoverResource = require('./discover_resource');

var MqttScout = module.exports = function(options) {

  this.client = new MqttClient(mqtt.connect(options.url, { username: options.username,
                                            password: options.password
                                                         }));
  
  Scout.call(this);
};
util.inherits(MqttScout, Scout);

MqttScout.prototype.init = function(callback) {
  this.client.on('connect', function() {
    console.log('mqtt started');
  });

  this.server.httpServer.cloud.add(DiscoverResource, this);
  callback();
};

MqttScout.prototype.startCommunicatingWithDevice = function(deviceId) {
  var self = this;
  this.client.subscribe('device/' + deviceId + '/$init');
  this.client.once('device/' + deviceId + '/$init', function(message, packet) {
    try {
      var deviceModel = JSON.parse(message);
    } catch(err) {
      console.error('Failed to parse device definition', err);
      return;
    }
    self.initDevice(deviceId, deviceModel);
    self.client.unsubscribe('device/' + deviceId + '/$init');
    self.client.publish('device/' + deviceId + '/$init/ack', JSON.stringify({}));
  });
};

MqttScout.prototype.initDevice = function(deviceId, deviceModel) {
  var self = this;
  var query = this.server.where({ id: deviceId });
  this.server.find(query, function(err, results) {
    if (results.length > 0) {
      var device = self.provision(results[0], MqttDriver, deviceId, deviceModel, self.client);
      if(!device) {
        device = self.server._jsDevices[deviceId];
        device.state = deviceModel.state;
        if(deviceModel.properties) {
          Object.keys(deviceModel.properties).forEach(function(key) {
            device[key] = deviceModel.properties[key];
          });
        }
        device._resetHeartbeat();
        device.log('device reconnected.');
      }
    } else {
      self.discover(MqttDriver, deviceId, deviceModel, self.client);
    }
  });
};
