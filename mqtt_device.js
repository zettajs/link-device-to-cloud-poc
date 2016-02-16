var util = require('util');
var Device = require('zetta').Device;

function getFromBitMask(mask, transitions) {
  return transitions.filter(function(obj, idx) {
    return ( ((mask>>idx) % 2 != 0) );
  }).map(function(obj) {
    return obj.name;
  });
}

var Driver = module.exports = function(deviceId, deviceModel, client) {
  Device.call(this);

  this.id = deviceId;
  this._model = deviceModel;
  this._client = client;

  var self = this;
  if (typeof this._model.properties === 'object') {
    Object.keys(this._model.properties).forEach(function(k) {
      self[k] = self._model.properties[k];
    });
  }
};
util.inherits(Driver, Device);

Driver.prototype.init = function(config) {
  var self = this;
  config
    .type(this._model.type)
    .state(this._model.state)

  Object.keys(this._model.machine).forEach(function(state) {
    var transitions = getFromBitMask(self._model.machine[state], self._model.transitions);
    console.log('State:', state, transitions);
    config.when(state, { allow: transitions });
  });

  this._model.transitions.forEach(function(transition) {
    config.map(transition.name, self._handleTransition.bind(self, transition), (transition.args || []));
    self._client.subscribe('device/' + self.id + '/$device-transition/' + transition.name);
    self._client.subscribe('device/' + self.id + '/$transition/' + transition.name + '/ack');
    self._client.on('device/' + self.id + '/$device-transition/' + transition.name, function(message, packet) {
      // check for our request.
      console.log('On Transition:', message);
      self._handleTransitionFromDevice(message, packet);
    });
  });

  this._model.streams.forEach(function(name) {
    config.stream(name, function(stream) {
      var topic = 'device/' + self.id + '/' + name;
      self._client.subscribe(topic);
      self._client.on(topic, function(message, packet) {
        console.log('streamData:', message.toString());
        stream.write(message.toString());
      });
    });
  });
};

Driver.prototype._handleTransition = function(transition /* args... callback*/) {
  var self = this;
  var callback = arguments[arguments.length-1];
  
  var input = [];
  if (transition.args) {
    transition.args.forEach(function(arg, idx) {
      input.push(arguments[idx+1]);
    });
  }
  
  var message = { messageId: 1, input: input };
  var topic = 'device/' + this.id + '/$transition/' + transition.name;

  console.log('Publish:', topic)
  this._client.publish(topic, JSON.stringify(message));
  this._client.once(topic + '/ack', function(message, packet) {
    console.log('got transition ack');
    var json = JSON.parse(message);
    if (json.failure) {
      return callback(new Error('Failed'));
    }

    self._handleDeviceUpdate(json);
    callback();
  });
};

Driver.prototype._handleDeviceUpdate = function(update) {
  var self = this;
  
  if (update.state) {
    this.state = update.state;
  }

  if (typeof update.properties === 'object') {
    Object.keys(update.properties).forEach(function(k) {
      self[k] = update.properties[k];
    });
  }
};

Driver.prototype._handleTransitionFromDevice = function(message, packet) {
  var json = JSON.parse(message);

  // tell zetta transition happened.
//  this.call('');
  
  this._handleDeviceUpdate(json);
};
