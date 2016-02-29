var EventEmitter = require('events').EventEmitter;
var util = require('util');

var MqttClient = module.exports = function(client) {
  this._client = client;
  EventEmitter.call(this);

  var self = this;
  this._client.on('message', function(topic, message, packet) {
    // device/123123/$init
    self.emit(topic, message, packet);
  });

  this._client.on('connect', this.emit.bind(this));
  this._client.on('reconnect', this.emit.bind(this));
  this._client.on('offline', this.emit.bind(this));
  this._client.on('close', this.emit.bind(this));
  this._client.on('error', this.emit.bind(this));
};
util.inherits(MqttClient, EventEmitter);

MqttClient.prototype.subscribe = function() {
  this._client.subscribe.apply(this._client, arguments);
};

MqttClient.prototype.publish = function() {
  this._client.publish.apply(this._client, arguments);
};

MqttClient.prototype.unsubscribe = function() {
  this._client.unsubscribe.apply(this._client, arguments);
};
