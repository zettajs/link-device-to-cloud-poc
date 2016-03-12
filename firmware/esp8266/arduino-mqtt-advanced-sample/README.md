# ESP8266 Link MQTT Example

Uses the the Arduino [ESP8266 build system](https://github.com/esp8266/Arduino) and this [Arduino Paho MQTT Wrapper](https://github.com/256dpi/arduino-mqtt) based off the [Eclipse Paho MQTT lib](https://eclipse.org/paho/clients/c/embedded/).

For json parsing and serialization it uses: https://github.com/bblanchon/ArduinoJson

The device first starts in access point mode, creating a open access point named `ESP-Thermostat-XX-XX-XX`. This allows a client to first connect to the device then send a HTTP POST to setup both the wifi and mqtt user and secret.

Example Configure Curl command:

`curl -i -X POST --data "ssid=Wifi-SSIDpass=password&user=5978f951ec231a27ff807ca9&secret=7ed8f3ae80f3d6307fcd87b77e95c3fbef48d1ea89c890dd" 192.168.4.1/`


Then restart the device and it will connect to the mqtt server in the source code. You will have to update the IP address and compile.

## Setup

1. Install the Arduino IDE
1. Setup the ESP8266 Arduino https://github.com/esp8266/Arduino
1. Install the Arduino MQTT library using the Library Manager.
1. Install the ArduinoJSON library using the Library Manager.
1. Modify the Arduino MQTT library max packet size. Edit `~/Documents/Arduino/libraries/MQTT/src/MQTTClient.h` and change the `MQTT_BUFFER_SIZE` to `1024` from `128`

## Memory Usage

```
Sketch uses 258,500 bytes (51%) of program storage space. Maximum is 499,696 bytes.
Global variables use 38,006 bytes (46%) of dynamic memory, leaving 43,914 bytes for local variables. Maximum is 81,920 bytes.
```

Link protocol adds `6204` to the program storage and `1748` to the global vars compared with a barebones MQTT connection.


Compared to a blank ESP8266 Arduino sketch.
```
Sketch uses 198,800 bytes (39%) of program storage space. Maximum is 499,696 bytes.
Global variables use 33,018 bytes (40%) of dynamic memory, leaving 48,902 bytes for local variables. Maximum is 81,920 bytes.
```

Compared to a blank ESP8266 Arduino sketch with the MQTT lib and JSON lib added.
```
Sketch uses 202,628 bytes (40%) of program storage space. Maximum is 499,696 bytes.
Global variables use 33,222 bytes (40%) of dynamic memory, leaving 48,698 bytes for local variables. Maximum is 81,920 bytes.
```

Basic MQTT Client with JSON lib. Not publish or subscribes.
```
Sketch uses 217,780 bytes (43%) of program storage space. Maximum is 499,696 bytes.
Global variables use 33,702 bytes (41%) of dynamic memory, leaving 48,218 bytes for local variables. Maximum is 81,920 bytes.
```
