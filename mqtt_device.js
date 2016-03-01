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

  config
    .when('$disconnected', { allow: [] });

  this._model.transitions = this._model.transitions.map(function(transition) {
    // Optionally support a string as the transition name
    if (typeof transition === 'string') {
      return { name: transition, args: [] };
    } else {
      return transition;
    }
  });
  
  Object.keys(this._model.machine).forEach(function(state) {
    var transitions = getFromBitMask(self._model.machine[state], self._model.transitions);
    config.when(state, { allow: transitions });
  });

  var timeoutInterval = 15000;
  var heartbeatTimer = setTimeout(function() {
    self.destroy();  
  }, timeoutInterval);

  self._client.subscribe('device/' + self.id + '/$disconnect');
  self._client.on('device/' + self.id + '/$disconnect', function(msg, packet) {
    self.state = '$disconnected';
  });

  self._client.subscribe('device/' + self.id + '/$heartbeat');
  self._client.on('device/' + self.id + '/$heartbeat', function(msg, packet) {
    clearTimeout(heartbeatTimer);
    var msgObj = JSON.parse(msg);
    self._handleDeviceUpdate(msgObj);
    heartbeatTimer = setTimeout(function() {
      self.destroy();  
    }, timeoutInterval);
  });
  this._model.transitions.forEach(function(transition) {
    config.map(transition.name, self._handleTransition.bind(self, transition), (transition.args || []));
    self._client.subscribe('device/' + self.id + '/$device-transition/' + transition.name);
    self._client.subscribe('device/' + self.id + '/$transition/' + transition.name + '/ack');
    self._client.on('device/' + self.id + '/$device-transition/' + transition.name, function(message, packet) {
      // check for our request.
      self._handleTransitionFromDevice(transition.name, message, packet);
    });
  });

  this._model.streams.forEach(function(obj) {
    var streamConfig = {
      name: '',
      monitor: true,
      binary: false
    };
    
    if (typeof obj === 'object') {
      if (!obj.name) {
        return;
      }
      streamConfig.name = obj.name + '';
      streamConfig.monitor = (obj.monitor) ? true : false;
      streamConfig.binary = (obj.binary) ? true : false;
    } else {
      // If not obj convert to string and use for name
      streamConfig.name = obj + '';
    }

    config.stream(streamConfig.name, function(stream) {
      var topic = 'device/' + self.id + '/' + streamConfig.name;
      self._client.subscribe(topic);
      self._client.on(topic, function(message, packet) {

        if (streamConfig.binary) {
          stream.write(message);
          return;
        }
        
        var json = null;
        try {
          json = JSON.parse(message.toString());
        } catch(err) {
          stream.write(message.toString());  
        }

        if (streamConfig.monitor) {
          self[streamConfig.name] = json;
        }
        
        stream.write(json);
      });
    }, {
      binary: streamConfig.binary
    });
    
  });
};

Driver.prototype._handleTransition = function(transition /* args... callback*/) {
  var self = this;
  var callback = arguments[arguments.length-1];
  var args = arguments;
  
  var input = [];
  if (transition.args) {
    transition.args.forEach(function(arg, idx) {
      input.push(args[idx+1]);
    });
  }
  
  var message = { messageId: 1, input: input };
  var topic = 'device/' + this.id + '/$transition/' + transition.name;

  this._client.publish(topic, JSON.stringify(message));
  this._client.once(topic + '/ack', function(message, packet) {
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

Driver.prototype._handleTransitionFromDevice = function(transitionName, message, packet) {
  var json = JSON.parse(message);
  var self = this;

  this._handleDeviceUpdate(json);
  this._emitter.emit(transitionName);
  this._sendLogStreamEvent(transitionName, [], function(json) {
    self._log.emit('log', 'device', self.type + ' transition ' + transitionName, json); 
  });
};
