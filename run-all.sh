#!/bin/sh

docker run -d --hostname my-rabbit --name some-rabbit -p 8080:15672 -p 5672:5672 rabbitmq:3-management
docker run -d --name cred-server -p 8081:1338  zetta/zetta-mqtt-credential-server
docker run -d --name mqtt-mosca-broker -p 1884:1884 -e BROKER_URL= -e TARGET_URL= -e AUTH_API= zetta/zetta-mqtt-broker
docker run -d --name mqtt-target -p 8082:1337 -e BROKER_URL= zetta/zetta-mqtt-target


