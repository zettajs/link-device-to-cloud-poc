#!/bin/sh

source /etc/environment
#COREOS_PRIVATE_IPV4="10.0.0.226"
echo "Broker for ${COREOS_PRIVATE_IPV4}"

# Start RabbitMq
docker run -d --hostname my-rabbit --name some-rabbit -p 8080:15672 -p 5672:5672 rabbitmq:3-management
sleep 60

# Start Credentail Server
docker run -d --name cred-server -p 8081:1338  zetta/link-credential-api

# Start zetta-target
docker run -d --name mqtt-target -p 8082:1337 -e BROKER_URL=amqp://${COREOS_PRIVATE_IPV4}:5672 zetta/zetta-mqtt-target

# Start External MQTT Broker
docker run -d --name mqtt-mosca-external-broker -p 1883:1883 -e BROKER_URL=amqp://${COREOS_PRIVATE_IPV4}:5672 -e TARGET_URL=http://${COREOS_PRIVATE_IPV4}:8082 -e CREDENTIAL_API_URL=http://${COREOS_PRIVATE_IPV4}:8081 zetta/zetta-mqtt-external-broker

# Start Internal MQTT Broker
docker run -d --name mqtt-mosca-internal-broker -p 2883:1884 -e BROKER_URL=amqp://${COREOS_PRIVATE_IPV4}:5672 -e TARGET_URL=http://${COREOS_PRIVATE_IPV4}:8082 -e CREDENTIAL_API_URL=http://${COREOS_PRIVATE_IPV4}:8081 zetta/zetta-mqtt-internal-broker
