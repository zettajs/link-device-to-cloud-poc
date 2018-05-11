// Copyright 2018 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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

  this._client.on('connect', this.emit.bind(this, 'connect'));
  this._client.on('reconnect', this.emit.bind(this, 'reconnect'));
  this._client.on('offline', this.emit.bind(this, 'offline'));
  this._client.on('close', this.emit.bind(this, 'close'));
  this._client.on('error', this.emit.bind(this, 'error'));
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
