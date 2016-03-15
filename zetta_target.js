var zetta = require('zetta');
var MqttScout = require('./mqtt_scout');

var MemoryRegistries = require('zetta-memory-registry')(zetta);
var PeerRegistry = MemoryRegistries.PeerRegistry;
var DeviceRegistry = MemoryRegistries.DeviceRegistry;

var port = process.env.MAPPED_PORT || 1337;

zetta({ registry: new DeviceRegistry(), peerRegistry: new PeerRegistry()})
  .name('cloud-' + port)
  .use(MqttScout, { url: 'mqtt://localhost:1883', username: 'zetta-target', password: '12345' })
  .listen(port);
