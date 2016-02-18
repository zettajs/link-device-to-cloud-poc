var mqtt = require('mqtt');
var MqttClient = require('./mqtt-client');

var client = new MqttClient(mqtt.connect('mqtt://localhost:1883', {
  username: 'test2',
  password: 'abc'
}));

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
client.publish('$init', JSON.stringify({
  type: 'thermostat', // Should this be defined by the device? Could zetta derive it from provisioning/auth steps.
  state: 'off',
  properties: {
    serialNumber: '1L080B50230',
    modelNumber: '13WX78KS011',
    macAddress: '00:0a:95:9d:68:16',
    temperature: 60
  },
  transitions: [
    { name: 'set-temperature', args: [{ type: 'number', name: 'temperature' }]},
    { name: 'turn-fan-on' },
    { name: 'turn-fan-off' },
    { name: 'turn-on' },
    { name: 'turn-off'}
  ],
  machine: { // Send state machine, need list of states and what transitions are allowed for each.
    // Could you bit masking mapping to the transitions array, could save data on the wire and memory. Program space wouldn't necessarily be effected.
    'on':  0b10111, 
    'off': 0b01000
  },
  streams: ['temperature']
}));

client.subscribe('$init/ack');
client.on('$init/ack', function() {
  console.log('device connected')
});


// Publish Stream data for temperature
setInterval(function() {
  client.publish('temperature', ''+(Math.random() * 100));
}, 500);


console.log(process.pid);
// Wait for "on" button on device to send turn-on transition
process.on('SIGUSR2', function() {
  console.log('button press')
  // Device needs to publish a unsolicited transition happened and communicate state change
  client.publish('$device-transition/turn-on', JSON.stringify({ state: 'on' }));
});



// more ...

var transitions = ['turn-on', 'turn-off', 'set-temperature', 'turn-fan-on', 'turn-fan-off'];
transitions.forEach(function(topic) {
  client.subscribe('$transition/'+topic);
});

client.on('$transition/turn-on', function(message) {
  console.log('Turn on...')
  var json = JSON.parse(message);
  // Device needs to ACK and communicate state change
  client.publish('$transition/turn-on/ack', JSON.stringify({ messageId: message.messageId,
                                              state: 'on'
                                                           }));  
});

client.on('$transition/turn-off', function(message) {
  console.log('Turn off...')
  var json = JSON.parse(message);
  // Device needs to ACK and communicate state change
  client.publish('$transition/turn-off/ack', JSON.stringify({ messageId: message.messageId,
                                              state: 'off'
                                                           }));  
});

client.on('$transition/set-temperature', function(message) {
  var json = JSON.parse(message);
  console.log('set temperature... ', Number(json.input[0]));
  // Device needs to ACK and communicate state change
  client.publish('$transition/set-temperature/ack', JSON.stringify({ messageId: message.messageId
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


