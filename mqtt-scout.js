var util = require('util');
var Scout = require('zetta').Scout;
var mqtt = require('mqtt');
var MqttClient = require('./mqtt-client');
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
  console.log('start comm')
  var self = this;
  this.client.subscribe('device/' + deviceId + '/$init');
  this.client.once('device/' + deviceId + '/$init', function(message, packet) {
    var deviceModel = JSON.parse(message);
    self.initDevice(deviceId, deviceModel);
    self.client.unsubscribe('device/' + deviceId + '/$init');
    self.client.publish('device/' + deviceId + '/$init/ack', JSON.stringify({}));
  });
};

MqttScout.prototype.initDevice = function(deviceId, deviceModel) {
  console.log('init device', deviceId, deviceModel)
};
