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

var mqtt = require('mqtt');
var MqttClient = require('./mqtt_client');

var client = new MqttClient(mqtt.connect('mqtt://localhost:1883', {
  username: process.argv[2],
  password: process.argv[3]
}));

client.on('close', function() {
  console.log('on disconnect');
})


var currentState = 'off';
// Zetta Model of Thermostat
/*
config
  .type('thermostat')
  .when('on', { allow: ['set-temperature', 'turn-fan-on', 'turn-fan-off', 'turn-off'] })
  .when('off', { allow: ['turn-on'] })
  .map('set-temperature', function() {}, [{ type:'number', name: 'temperature' }])
  .map('turn-fan-on', function() {})
  .map('turn-fan-off', function() {})
  .map('turn-off', function() {})
  .monitor('temperature');
*/

// Mqtt Device



// Init Device - Zetta publishes that it's been initialized.
client.on('connect', function() {
  console.log('on connect')
  
  client.publish('$init', JSON.stringify({
    type: 'thermostat', // Should this be defined by the device? Could zetta derive it from provisioning/auth steps.
    state: currentState,
    properties: {
      serialNumber: '1L080B50230',
      modelNumber: '13WX78KS011',
      macAddress: '00:0a:95:9d:68:16',
      temperature: 60
    },
    transitions: [
      { name: 'set-temperature', args: [{ type: 'number', name: 'temperature' }]},
      'turn-fan-on',
      'turn-fan-off',
      'turn-on',
      'turn-off'
    ],
    machine: { // Send state machine, need list of states and what transitions are allowed for each.
      // Could you bit masking mapping to the transitions array, could save data on the wire and memory. Program space wouldn't necessarily be effected.
      'on':  0b10111, 
      'off': 0b01000
    },
    streams: ['temperature']
  }));
})

client.subscribe('$init/ack');
client.on('$init/ack', function() {
  console.log('device connected')
});


// Publish Stream data for temperature
//setInterval(function() {
//  client.publish('temperature', ''+(Math.random() * 100));
//}, 500);


console.log(process.pid);
// Wait for "on" button on device to send turn-on transition
process.on('SIGUSR2', function() {
  console.log('button press')
  // Device needs to publish a unsolicited transition happened and communicate state change
  currentState = (currentState == 'off') ? 'on' : 'off';
  client.publish('$device-transition/turn-' + currentState, JSON.stringify({ state: currentState }));
});



// more ...

var transitions = ['turn-on', 'turn-off', 'set-temperature', 'turn-fan-on', 'turn-fan-off'];
transitions.forEach(function(topic) {
  client.subscribe('$transition/'+topic);
});

client.on('$transition/turn-on', function(message) {
  console.log('Turn on...')
  var json = JSON.parse(message);
  currentState = 'on';
  // Device needs to ACK and communicate state change
  client.publish('$transition/turn-on/ack', JSON.stringify({ messageId: message.messageId,
                                              state: 'on'
                                                           }));  
});

client.on('$transition/turn-off', function(message) {
  console.log('Turn off...')
  var json = JSON.parse(message);
  currentState = 'off';
  // Device needs to ACK and communicate state change
  client.publish('$transition/turn-off/ack', JSON.stringify({ messageId: message.messageId,
                                              state: 'off'
                                                           }));  
});

client.on('$transition/set-temperature', function(message) {
  var json = JSON.parse(message);
  console.log(json);
  var setPoint = Number(json.input[0])
  console.log('set temperature... ', setPoint);
  // Device needs to ACK and communicate state change
  client.publish('$transition/set-temperature/ack', JSON.stringify({ messageId: message.messageId,
                                                          properties: {
                                                            setPoint: setPoint
                                                          }
                                                           }));  

});

client.on('$transition/turn-fan-on', function(message) {
  console.log('Turn on fan...')
  var json = JSON.parse(message);
  // Device needs to ACK and communicate state change
  client.publish('$transition/turn-fan-on/ack', JSON.stringify({ messageId: message.messageId
                                                           }));  
});

client.on('$transition/turn-fan-off', function(message) {
  console.log('Turn off fan...')
  var json = JSON.parse(message);
  // Device needs to ACK and communicate state change
  client.publish('$transition/turn-fan-off/ack', JSON.stringify({ messageId: message.messageId
                                                           }));  
});

//setInterval(function() {
//  client.publish('$heartbeat', JSON.stringify({ state: currentState }));
//}, 5000)
