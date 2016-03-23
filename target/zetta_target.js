var zetta = require('zetta');
var MqttScout = require('./mqtt_scout');
var MemoryRegistries = require('zetta-memory-registry')(zetta);
var PeerRegistry = MemoryRegistries.PeerRegistry;
var DeviceRegistry = MemoryRegistries.DeviceRegistry;

var port = process.env.MAPPED_PORT || 1337;
var mqttClientId = (process.env.COREOS_PRIVATE_IPV4 || 'localhost') + ':' + port;

zetta({ registry: new DeviceRegistry(), peerRegistry: new PeerRegistry()})
  .name('cloud-devices')
  .use(MqttScout, { clientId: mqttClientId, url: process.env.BROKER_URL || 'mqtt://localhost:1884', username: 'zetta-target', password: '12345' })
  .listen(port);
