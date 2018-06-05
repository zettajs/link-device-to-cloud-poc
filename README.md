# Device to Cloud POC for Apigee Link

## Purpose 

To demonstrate the functionality of connecting a device directly to Apigee Link via MQTT. 

## Files

1. `discover_resource.js`
  * HTTP based scouting mechanism for creating MQTT based devices
2. `example-device-subscriptions.js`
  * MQTT based mock device. 
3. `mqtt-client.js`
  * A wrapped MQTT client to follow the node event emitter pattern more closely. 
  * emits topic events of incoming MQTT message. The MQTT packet is the additional argument.s
4. `mqtt-scout.js`
  * Scout class for MQTT devices. Creates an HTTP based resource for scouting. 
  * Wires up the MQTT connection to Zetta after a device is discovered or provisioned.
5. `mqtt_device.js`
  * Dynamic Zetta device using the Zetta MQTT protocol to generate a device representation usable by Zetta.
6. `server.js`
  * The MQTT broker. Adds additional functionality to an in memory Mosca broker.
7. `zetta-target.js`
  * The Zetta target server.

## Discovery Flow

1. MQTT devices announces presence to broker.
2. Broker sends an HTTP request to a zetta target server running the MQTT scout.
3. Zetta initializes device. Sends message to broker that device has been created.
4. Device sends representation of self to broker, and then is passed to Zetta.
5. Zetta dynamically configures device based on capabilities expressed over MQTT.

## Disclaimer

This is not an officially supported Google product.
