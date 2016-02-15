var util = require('util');
var Scout = require('zetta').Scout;
var mqtt = require('mqtt');
var DiscoverResource = require('./discover_resource');

var MqttScout = module.exports = function(options) {
  
  this.client = mqtt.connect(options.url, { username: options.username,
                                            password: options.password
                                          });
  
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
  
  client.subscribe('device/' + json.id + '/$init/ack');
  client.on('device/' + json.id + '/$init/ack', function(packet) {
    var deviceModel = JSON.parse(packet.payload);
    initDevice(json.deviceId, deviceModel);
    client.subscribe('device/' + json.id + '/$init/ack');
  });
  
  client.publish('device/' + json.id + '/$init', JSON.stringify({}) );  
};

MqttScout.prototype.initDevice = function(deviceId, deviceModel) {
  
};
