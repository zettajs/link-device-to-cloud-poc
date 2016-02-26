// This example uses an Adafruit Huzzah ESP8266
// to connect to shiftr.io.
//
// You can check on your device after a successful
// connection here: https://shiftr.io/try.
//
// by Joël Gähwiler
// https://github.com/256dpi/arduino-mqtt

#include <ESP8266WiFi.h>
#include <MQTTClient.h>
#include <ArduinoJson.h>

#define LINK_DEVICE_TRANSITION_TOPIC "$device-transition/"
#define LINK_TRANSITION_TOPIC "$transition/"
#define LINK_INIT_TOPIC "$init"
#define LINK_INIT_ACK_TOPIC "$init/ack"
#define TRANSITION_TOPIC(topic) LINK_TRANSITION_TOPIC topic
#define TRANSITION_TOPIC_ACK(topic) LINK_TRANSITION_TOPIC topic "/ack"

#define RELAY_GPIO 5
#define TEMP_SENSOR_GPIO A0

const char WIFI_SSID[]       = "ssid";
const char WIFI_PASS[]       = "pass";
const char MQTT_SERVER[]     = "10.0.0.226";
const int  MQTT_PORT         = 1883;
const char MQTT_USERNAME[]   = "test2";
const char MQTT_PASSWORD[]   = "abc";

const char STREAM_TEMPERATURE[] = "temperature";

#define MAX_JSON_LEN 1024
char serializeBuffer[MAX_JSON_LEN];

WiFiClient net;
MQTTClient client;
unsigned long lastMillis = 0;

enum TheromostatStates {
  THERMOSTAT_STATE_OFF,
  THERMOSTAT_STATE_ON
};
TheromostatStates thermostatState = THERMOSTAT_STATE_OFF;
const char* TheromostatStateNames[] = {"off", "on"};

int temperatureSetPoint = 69;

void setup();
void connect();
void init_link();
void loop();

void setup() {
  pinMode(RELAY_GPIO, OUTPUT);
  digitalWrite(RELAY_GPIO, (thermostatState == THERMOSTAT_STATE_ON) ? LOW : HIGH);

  Serial.begin(9600);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  client.begin(MQTT_SERVER, MQTT_PORT, net);

  connect();
}

void connect() {
  Serial.print("checking wifi...");
  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    delay(500);
  }

  Serial.println("WiFi connected");
  Serial.println("IP address: "); Serial.println(WiFi.localIP());

  Serial.print("\nconnecting...");
  while (!client.connect(MQTT_USERNAME, MQTT_USERNAME, MQTT_PASSWORD)) {
    Serial.print(".");
  }

  Serial.println("\nconnected!");

  client.subscribe(LINK_INIT_ACK_TOPIC);
  client.subscribe(TRANSITION_TOPIC("set-temperature"));
  client.subscribe(TRANSITION_TOPIC("turn-fan-on"));
  client.subscribe(TRANSITION_TOPIC("turn-fan-off"));
  client.subscribe(TRANSITION_TOPIC("turn-on"));
  client.subscribe(TRANSITION_TOPIC("turn-off"));

  init_link();
}


void init_link() {
  StaticJsonBuffer<MAX_JSON_LEN> jsonBuffer;

  JsonObject& root = jsonBuffer.createObject();
  root["type"] = "theromostat";
  root["state"] = TheromostatStateNames[thermostatState];

  JsonObject& properties = root.createNestedObject("properties");
  properties["serialNumber"] = "1L080B50230";
  properties["modelNumber"] = "13WX78KS011";
  properties["macAddress"] = "00:0a:95:9d:68:16";
  properties["temperature"] = 60;
  properties["setPoint"] = temperatureSetPoint;

  JsonArray& transitions = root.createNestedArray("transitions");

  // Set Temperature
  {
    JsonObject& t = transitions.createNestedObject();
    t["name"] = "set-temperature";

    JsonArray& args = t.createNestedArray("args");
    JsonObject& arg = args.createNestedObject();
    arg["type"] = "number";
    arg["name"] = "temperature";
  }

  // Turn fan on
  {
    JsonObject& t = transitions.createNestedObject();
    t["name"] = "turn-fan-on";
  }

  // Turn fan  off
  {
    JsonObject& t = transitions.createNestedObject();
    t["name"] = "turn-fan-off";
  }

  // Turn on
  {
    JsonObject& t = transitions.createNestedObject();
    t["name"] = "turn-on";
  }

  // Turn off
  {
    JsonObject& t = transitions.createNestedObject();
    t["name"] = "turn-off";
  }

  JsonObject& machine = root.createNestedObject("machine");
  machine["on"]  = 0b10111;
  machine["off"] = 0b01000;

  JsonArray& streams = root.createNestedArray("streams");
  streams.add(STREAM_TEMPERATURE);

  root.printTo(serializeBuffer, MAX_JSON_LEN);
  client.publish(LINK_INIT_TOPIC, serializeBuffer);
}

void loop() {
  client.loop();
  //  delay(10); // <- fixes some issues with WiFi stability

  if(!client.connected()) {
    connect();
  }

  // publish a message roughly every second.
  if(millis() - lastMillis > 500) {
    lastMillis = millis();
    String buffer = String(analogRead(TEMP_SENSOR_GPIO));
    client.publish(STREAM_TEMPERATURE, buffer);
  }
}

void onSetTemperature(int messageId, int setPoint) {
  Serial.print("Set Temp:");
  Serial.println(setPoint);

  StaticJsonBuffer<MAX_JSON_LEN> jsonBuffer;

  JsonObject& root = jsonBuffer.createObject();
  root["messageId"] = messageId;

  if (setPoint >= 40 && setPoint <= 90) {
    JsonObject& properties = root.createNestedObject("properties");
    temperatureSetPoint = setPoint;
    properties["setPoint"] = setPoint;
  } else {
    root["failure"] = "Invalid set point";
  }

  root.printTo(serializeBuffer, MAX_JSON_LEN);
  client.publish(TRANSITION_TOPIC_ACK("set-temperature"), serializeBuffer);
}

void onTurnOn(int messageId) {
  Serial.println("Turn On");
  thermostatState = THERMOSTAT_STATE_ON;
  digitalWrite(RELAY_GPIO, (thermostatState == THERMOSTAT_STATE_ON) ? LOW : HIGH);

  StaticJsonBuffer<MAX_JSON_LEN> jsonBuffer;

  JsonObject& root = jsonBuffer.createObject();
  root["messageId"] = messageId;
  root["state"] = TheromostatStateNames[thermostatState];

  root.printTo(serializeBuffer, MAX_JSON_LEN);
  client.publish(TRANSITION_TOPIC_ACK("turn-on"), serializeBuffer);
}

void onTurnOff(int messageId) {
  Serial.println("Turn Off");
  thermostatState = THERMOSTAT_STATE_OFF;
  digitalWrite(RELAY_GPIO, (thermostatState == THERMOSTAT_STATE_ON) ? LOW : HIGH);

  StaticJsonBuffer<MAX_JSON_LEN> jsonBuffer;

  JsonObject& root = jsonBuffer.createObject();
  root["messageId"] = messageId;
  root["state"] = TheromostatStateNames[thermostatState];

  root.printTo(serializeBuffer, MAX_JSON_LEN);
  client.publish(TRANSITION_TOPIC_ACK("turn-off"), serializeBuffer);
}

void onTurnFanOn(int messageId) {
  Serial.println("Turn Fan On");

  StaticJsonBuffer<MAX_JSON_LEN> jsonBuffer;

  JsonObject& root = jsonBuffer.createObject();
  root["messageId"] = messageId;

  root.printTo(serializeBuffer, MAX_JSON_LEN);
  client.publish(TRANSITION_TOPIC_ACK("turn-fan-on"), serializeBuffer);
}

void onTurnFanOff(int messageId) {
  Serial.println("Turn Fan Off");

  StaticJsonBuffer<MAX_JSON_LEN> jsonBuffer;

  JsonObject& root = jsonBuffer.createObject();
  root["messageId"] = messageId;

  root.printTo(serializeBuffer, MAX_JSON_LEN);
  client.publish(TRANSITION_TOPIC_ACK("turn-fan-off"), serializeBuffer);
}

void messageReceived(String topic, String payload, char * bytes, unsigned int length) {
  StaticJsonBuffer<MAX_JSON_LEN> jsonBuffer;
  int messageId;

  if (topic == TRANSITION_TOPIC("set-temperature")) {
    JsonObject& root = jsonBuffer.parseObject(payload);
    messageId = root["messageId"];
    int temp = root["input"][0];
    onSetTemperature(messageId, temp);
  }
  else if (topic == TRANSITION_TOPIC("turn-fan-on")) {
    JsonObject& root = jsonBuffer.parseObject(payload);
    messageId = root["messageId"];
    onTurnFanOn(messageId);
  }
  else if (topic == TRANSITION_TOPIC("turn-fan-off")) {
    JsonObject& root = jsonBuffer.parseObject(payload);
    messageId = root["messageId"];
    onTurnFanOff(messageId);
  }
  else if (topic == TRANSITION_TOPIC("turn-on")) {
    JsonObject& root = jsonBuffer.parseObject(payload);
    messageId = root["messageId"];
    onTurnOn(messageId);
  }
  else if (topic == TRANSITION_TOPIC("turn-off")) {
    JsonObject& root = jsonBuffer.parseObject(payload);
    messageId = root["messageId"];
    onTurnOff(messageId);
  }
}
