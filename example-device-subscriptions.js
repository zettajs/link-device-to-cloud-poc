var mqtt = require('mqtt');
var client = mqtt.connect('mqtt://centralite.link.apigee.net:8883');

// Zetta Model of Thermostat
config
  .type('thermostat')
  .when('on', { allow: ['set-temperature', 'turn-fan-on', 'turn-fan-off', 'turn-off'] })
  .when('off', { allow: ['turn-on'] })
  .map('set-temperature', function() {}, [{ type:'number', name: 'temperature' }])
  .map('turn-fan-on', function() {})
  .map('turn-fan-off', function() {})
  .map('turn-off', function() {})
  .monitor('temperature');

// Mqtt Device

// Init Device - Zetta publishes that it's been initialized.
client.on('$init', function(message) {
  
  client.publish('$init/ack', { messageId: message.messageId,
                                type: 'thermostat', // Should this be defined by the device? Could zetta derive it from provisioning/auth steps.
                                state: 'off',
                                properties: {
                                  serialNumber: '1L080B50230',
                                  modelNumber: '13WX78KS011',
                                  macAddress: '00:0a:95:9d:68:16',
                                  temperature: 60
                                },
                                transitions: ['set-temperature', 'turn-fan-on', 'turn-fan-off', 'turn-on', 'turn-off'],
                                machine: { // Send state machine, need list of states and what transitions are allowed for each.
                                  // Could you bit masking mapping to the transitions array, could save data on the wire and memory. Program space wouldn't necessarily be effected.
                                  'on':  //0b10111 
                                  'off': //0b01111
                                },
                                streams: ['temperature']
                              });

});

// Publish Stream data for temperature
setInterval(function() {
  client.publish('temperature', Math.rand() * 100);
}, 250);


// Wait for "on" button on device to send turn-on transition
button.on('pressed', function() {
  // Device needs to publish a unsolicited transition happened and communicate state change
  client.published('$transition/turn-on', { state: 'on' } );
});


// Setup Transitions
client.on('$transition/turn-off', function(message) {
  
  // Device needs to ACK and communicate state change
  client.publish('$transition/ack', { messageId: message.messageId,
                                      state: 'off', // tell zetta of new state
                                      properties: { // update all the properties on the driver in zetta
                                        someValue: 'New Value'
                                      }
                                    });
});


// more ...
client.on('$transition/turn-on', function(message) {
});

client.on('$transition/set-temperature', function(message) {
});

client.on('$transition/turn-fan-on', function(message) {
});

client.on('$transition/turn-fan-off', function(message) {
});

