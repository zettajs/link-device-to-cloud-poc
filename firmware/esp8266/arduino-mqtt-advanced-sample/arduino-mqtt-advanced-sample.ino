/*
 * Copyright (c) 2015, Majenko Technologies
 * All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 * 
 * * Redistributions of source code must retain the above copyright notice, this
 *   list of conditions and the following disclaimer.
 * 
 * * Redistributions in binary form must reproduce the above copyright notice, this
 *   list of conditions and the following disclaimer in the documentation and/or
 *   other materials provided with the distribution.
 * 
 * * Neither the name of Majenko Technologies nor the names of its
 *   contributors may be used to endorse or promote products derived from
 *   this software without specific prior written permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
 * ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/* Create a WiFi access point and provide a web server on it. */

#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <EEPROM.h>
#include <MQTTClient.h>
#include <ArduinoJson.h>

// ID of the settings block
#define CONFIG_VERSION "epb"
#define CONFIG_START 32

#define WIFI_CONNECT_TIMEOUT 60000

#define TEMPERATURE_PUBLISH_INTERVAL 500
#define RESET_BUTTON_THRESHOLD 1000

#define MAX_NAME_LENGTH 50
#define MAX_WIFI_SSID_LENGTH 32
#define MAX_WIFI_PASSWORD_LENGTH 64
#define MQTT_USER_LENGTH 24
#define MQTT_SECRET_LENGTH 48

#define LINK_DEVICE_TRANSITION_TOPIC "$device-transition/"
#define LINK_TRANSITION_TOPIC "$transition/"
#define LINK_INIT_TOPIC "$init"
#define LINK_INIT_ACK_TOPIC "$init/ack"
#define TRANSITION_TOPIC(topic) LINK_TRANSITION_TOPIC topic
#define TRANSITION_TOPIC_ACK(topic) LINK_TRANSITION_TOPIC topic "/ack"

#define MAX_JSON_LEN 1024

#define STATUS_LED_GPIO 5
#define RELAY_GPIO 0
#define TEMP_SENSOR_GPIO A0
#define CONFIG_RESET_GPIO 2

enum BlinkStatusRates {
  BLINK_AP_MODE=250,
  BLINK_MQTT_CONNECTING=50,
  BLINK_MQTT_CONNECTED=5000,
};

enum OperatingModes {
  MODE_UNINITIALIZED, // Starts in AP mode.
  MODE_SETUP_TRY, // Attempt to connect to ssid and mqtt if failed revert to unitialized, if success go to initialized.
  MODE_INITIALIZED // Can connect to ssid and mqtt
};

enum TheromostatStates {
  THERMOSTAT_STATE_OFF,
  THERMOSTAT_STATE_ON
};

const char MQTT_SERVER[]     = "10.0.0.226";
const int  MQTT_PORT         = 1883;
const char STREAM_TEMPERATURE[] = "temperature";
const char* TheromostatStateNames[] = {"off", "on"};

struct ConfigStoreStruct {
  char version[4];
  
  OperatingModes mode;
  char name[MAX_NAME_LENGTH+1];
  char ssid[MAX_WIFI_SSID_LENGTH+1];
  char wifiPassword[MAX_WIFI_PASSWORD_LENGTH+1];
  char mqttUser[MQTT_USER_LENGTH+1];
  char mqttSecret[MQTT_SECRET_LENGTH+1];
  TheromostatStates thermostatState;
  int setPoint;
} configStorage = {
  CONFIG_VERSION,
  
  MODE_UNINITIALIZED,
  "ESP Thermostat"
  "SSID",
  "PASS",
  "USER",
  "SECRET",
  THERMOSTAT_STATE_OFF,
  65
};

/* Set these to your desired credentials. */
char ssidBase[] = "ESP-Thermostat-XX-XX-XX";
byte macAddress[6];
char serializeBuffer[MAX_JSON_LEN];
unsigned long lastTempMillis = 0;
unsigned long lastBlinkMillis = 0;
bool blinkState = false;
OperatingModes runMode;

WiFiClient* net;
MQTTClient* mqttClient;
ESP8266WebServer* httpServer;

void conenctToMQTT();
void init_link();


void checkAndBlinkLed(const int interval) {
  const unsigned long currentMillis = millis();
  if (currentMillis-lastBlinkMillis >= interval) {
    lastBlinkMillis = currentMillis;
    blinkState = !blinkState;
    digitalWrite(STATUS_LED_GPIO, (blinkState) ? LOW : HIGH);
  }
}

void loadConfig() {
  // To make sure there are settings, and they are YOURS!
  // If nothing is found it will use the default settings.
  if (EEPROM.read(CONFIG_START + 0) == CONFIG_VERSION[0] &&
      EEPROM.read(CONFIG_START + 1) == CONFIG_VERSION[1] &&
      EEPROM.read(CONFIG_START + 2) == CONFIG_VERSION[2])
   {
     for (unsigned int t=0; t<sizeof(configStorage); t++) {
       *((char*)&configStorage + t) = EEPROM.read(CONFIG_START + t);
     }
   } else {
    Serial.println("Did not match");
   }
}

void saveConfig() {
  for (unsigned int t=0; t<sizeof(configStorage); t++) {
    EEPROM.write(CONFIG_START + t, *((char*)&configStorage + t));
  }
  EEPROM.commit();
}

/* Just a little test message.  Go to http://192.168.4.1 in a web browser
 * connected to this access point to see it.
 */
void handleRoot() {
  httpServer->sendHeader("Connection", "close");
  httpServer->sendHeader("Access-Control-Allow-Origin", "*");
  httpServer->send(200, "text/html", "<h1>You are connected</h1>");
}

void handleConfigure() {
  httpServer->sendHeader("Connection", "close");
  httpServer->sendHeader("Access-Control-Allow-Origin", "*");

  String ssid = httpServer->arg("ssid");
  String password = httpServer->arg("pass");
  String mqttUser = httpServer->arg("user");
  String mqttSecret = httpServer->arg("secret");

  if (ssid.length() == 0) {
    httpServer->send(400, "text/html", "Must supply ssid.");
    return;
  }

  if (mqttUser.length() != MQTT_USER_LENGTH) {
    httpServer->send(400, "text/html", "User must be 24 bytes long.");
  }

  if (mqttSecret.length() != MQTT_SECRET_LENGTH) {
    httpServer->send(400, "text/html", "Secret must be 24 bytes long.");
  }

  if (password.length() > MAX_WIFI_PASSWORD_LENGTH) {
    httpServer->send(400, "text/html", "Password too long.");
  }

  ssid.toCharArray(configStorage.ssid, MAX_WIFI_SSID_LENGTH+1);
  password.toCharArray(configStorage.wifiPassword, MAX_WIFI_PASSWORD_LENGTH+1);
  mqttUser.toCharArray(configStorage.mqttUser, MQTT_USER_LENGTH+1);
  mqttSecret.toCharArray(configStorage.mqttSecret, MQTT_SECRET_LENGTH+1);

  configStorage.mode = MODE_SETUP_TRY;
  saveConfig();

  httpServer->send(200, "text/html", "<h1>Configured device</h1>");

  ESP.restart();
}


void setupAPMode() {
  Serial.println();
  Serial.println("Configuring access point...");

  char temp[2];
  sprintf(temp, "%02X", macAddress[2]);
  memcpy(&ssidBase[15], temp, strlen(temp));
  sprintf(temp, "%02X", macAddress[1]);
  memcpy(&ssidBase[18], temp, strlen(temp));
  sprintf(temp, "%02X", macAddress[0]);
  memcpy(&ssidBase[21], temp, strlen(temp));

  Serial.println(ssidBase);
  
  WiFi.softAP(ssidBase);

  
  httpServer = new ESP8266WebServer(80);
  httpServer->on("/", HTTP_GET, handleRoot);
  httpServer->on("/", HTTP_POST, handleConfigure);
  httpServer->begin();
  Serial.println("HTTP server started");
}

void setupRunMode() {
  Serial.println("Starting MQTT client...");

  
  net = new WiFiClient();
  mqttClient = new MQTTClient();
  
  if (configStorage.wifiPassword[0] == '\0') {
    WiFi.begin(configStorage.ssid);
  } else {
    WiFi.begin(configStorage.ssid, configStorage.wifiPassword);
  }

  mqttClient->begin(MQTT_SERVER, MQTT_PORT, *net);


  Serial.print("Connecting to wifi");
  int startTime = millis();
  while (WiFi.status() != WL_CONNECTED) {
    checkAndBlinkLed(BLINK_MQTT_CONNECTING);
    delay(10);

    if (millis() - startTime > WIFI_CONNECT_TIMEOUT) {
      Serial.println("Timeout!");

      if (runMode == MODE_SETUP_TRY) {
        configStorage.mode = MODE_UNINITIALIZED;
        saveConfig();
      }
       
      ESP.restart();
    }
  }
  Serial.println("Connected!");
  configStorage.mode = MODE_INITIALIZED;
  saveConfig();

  conenctToMQTT();
}

void conenctToMQTT() { 
  Serial.print("\nconnecting to mqtt...");
  while (!mqttClient->connect(configStorage.mqttUser, configStorage.mqttUser, configStorage.mqttSecret)) {
    Serial.print(".");
    checkAndBlinkLed(BLINK_MQTT_CONNECTING);
  }

  Serial.println("\nconnected!");

  mqttClient->subscribe(LINK_INIT_ACK_TOPIC);
  mqttClient->subscribe(TRANSITION_TOPIC("set-temperature"));
  mqttClient->subscribe(TRANSITION_TOPIC("turn-fan-on"));
  mqttClient->subscribe(TRANSITION_TOPIC("turn-fan-off"));
  mqttClient->subscribe(TRANSITION_TOPIC("turn-on"));
  mqttClient->subscribe(TRANSITION_TOPIC("turn-off"));

  init_link();
}


void setup() {
  Serial.begin(115200);
  EEPROM.begin(512);

  

  // Configure GPIO
  pinMode(RELAY_GPIO, OUTPUT);
  pinMode(STATUS_LED_GPIO, OUTPUT);
  pinMode(CONFIG_RESET_GPIO, INPUT);
  digitalWrite(STATUS_LED_GPIO, LOW);

  bool resetConfig = true;
  unsigned long startTime = millis();
  while (millis() - startTime < RESET_BUTTON_THRESHOLD) {
    // At any point in the 1 sec if button goes high don't reset config
    if (digitalRead(CONFIG_RESET_GPIO) == LOW) {
      resetConfig = true;
      break;
    }
    delay(1);
  }

/*
  if (resetConfig) {
    Serial.println("Reset Config");
    configStorage.mode = MODE_UNINITIALIZED;
    saveConfig();
  }
*/

  loadConfig();

  digitalWrite(RELAY_GPIO, (configStorage.thermostatState == THERMOSTAT_STATE_ON) ? LOW : HIGH); 

  // Load mac address
  WiFi.macAddress(macAddress);
  
  // Does not change until device is reset.
  runMode = configStorage.mode;

  Serial.println("Loaded Config");
  Serial.print("Run Mode:");
  Serial.println(runMode);

  switch (runMode) {
    case MODE_UNINITIALIZED:
      setupAPMode();
      break;
    case MODE_SETUP_TRY:
    case MODE_INITIALIZED:
      setupRunMode();
      break;
    default:
      setupRunMode();
  }
  
}

void loop() {
  unsigned long currentMillis = millis();

  if (runMode == MODE_UNINITIALIZED) {
    httpServer->handleClient();
    checkAndBlinkLed(BLINK_AP_MODE);
    delay(1);
    
  } else if (runMode == MODE_SETUP_TRY || runMode == MODE_INITIALIZED) {
    mqttClient->loop();
    
    if (!mqttClient->connected()) {
      conenctToMQTT();
    }

    
    if (currentMillis-lastTempMillis >= TEMPERATURE_PUBLISH_INTERVAL) {
      lastTempMillis = currentMillis;
      String buffer = String(analogRead(TEMP_SENSOR_GPIO));
      mqttClient->publish(STREAM_TEMPERATURE, buffer);
    }

    checkAndBlinkLed(BLINK_MQTT_CONNECTED);
    
    delay(10); // <- fixes some issues with WiFi stability
  }
}


void init_link() {
  StaticJsonBuffer<MAX_JSON_LEN> jsonBuffer;

  JsonObject& root = jsonBuffer.createObject();
  root["type"] = "theromostat";
  root["state"] = TheromostatStateNames[configStorage.thermostatState];

  JsonObject& properties = root.createNestedObject("properties");
  properties["serialNumber"] = "1L080B50230";
  properties["modelNumber"] = "13WX78KS011";
  char mactemp[18];
  sprintf(mactemp, "%02X:%02X:%02X:%02X:%02X:%02X", macAddress[5],macAddress[4],macAddress[3],macAddress[2],macAddress[1],macAddress[0]);
  
  properties["macAddress"] = mactemp;
  properties["temperature"] = 60;
  properties["setPoint"] = configStorage.setPoint;

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
  mqttClient->publish(LINK_INIT_TOPIC, serializeBuffer);
}

void onSetTemperature(int messageId, int setPoint) {
  Serial.print("Set Temp:");
  Serial.println(setPoint);

  StaticJsonBuffer<MAX_JSON_LEN> jsonBuffer;

  JsonObject& root = jsonBuffer.createObject();
  root["messageId"] = messageId;

  if (setPoint >= 40 && setPoint <= 90) {
    JsonObject& properties = root.createNestedObject("properties");
    configStorage.setPoint = setPoint;
    properties["setPoint"] = setPoint;
  } else {
    root["failure"] = "Invalid set point";
  }

  saveConfig();

  root.printTo(serializeBuffer, MAX_JSON_LEN);
  mqttClient->publish(TRANSITION_TOPIC_ACK("set-temperature"), serializeBuffer);
}

void onTurnOn(int messageId) {
  Serial.println("Turn On");
  configStorage.thermostatState = THERMOSTAT_STATE_ON;
  digitalWrite(RELAY_GPIO, (configStorage.thermostatState == THERMOSTAT_STATE_ON) ? LOW : HIGH);
  saveConfig();

  StaticJsonBuffer<MAX_JSON_LEN> jsonBuffer;

  JsonObject& root = jsonBuffer.createObject();
  root["messageId"] = messageId;
  root["state"] = TheromostatStateNames[configStorage.thermostatState];

  root.printTo(serializeBuffer, MAX_JSON_LEN);
  mqttClient->publish(TRANSITION_TOPIC_ACK("turn-on"), serializeBuffer);
}

void onTurnOff(int messageId) {
  Serial.println("Turn Off");
  configStorage.thermostatState = THERMOSTAT_STATE_OFF;
  digitalWrite(RELAY_GPIO, (configStorage.thermostatState == THERMOSTAT_STATE_ON) ? LOW : HIGH);
  saveConfig();

  StaticJsonBuffer<MAX_JSON_LEN> jsonBuffer;

  JsonObject& root = jsonBuffer.createObject();
  root["messageId"] = messageId;
  root["state"] = TheromostatStateNames[configStorage.thermostatState];

  root.printTo(serializeBuffer, MAX_JSON_LEN);
  mqttClient->publish(TRANSITION_TOPIC_ACK("turn-off"), serializeBuffer);
}

void onTurnFanOn(int messageId) {
  Serial.println("Turn Fan On");

  StaticJsonBuffer<MAX_JSON_LEN> jsonBuffer;

  JsonObject& root = jsonBuffer.createObject();
  root["messageId"] = messageId;

  root.printTo(serializeBuffer, MAX_JSON_LEN);
  mqttClient->publish(TRANSITION_TOPIC_ACK("turn-fan-on"), serializeBuffer);
}

void onTurnFanOff(int messageId) {
  Serial.println("Turn Fan Off");

  StaticJsonBuffer<MAX_JSON_LEN> jsonBuffer;

  JsonObject& root = jsonBuffer.createObject();
  root["messageId"] = messageId;

  root.printTo(serializeBuffer, MAX_JSON_LEN);
  mqttClient->publish(TRANSITION_TOPIC_ACK("turn-fan-off"), serializeBuffer);
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

