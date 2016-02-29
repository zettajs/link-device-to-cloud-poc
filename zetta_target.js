var zetta = require('zetta');
var MqttScout = require('./mqtt_scout');

zetta()
  .use(MqttScout, { url: 'mqtt://localhost:1883', username: 'zetta-target', password: '12345' })
  .listen(1337);
