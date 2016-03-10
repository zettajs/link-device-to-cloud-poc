#!/bin/sh

docker run -d --name cred-server -p 8081:1338 zetta/zetta-mqtt-credential-server
docker run -d --name mqtt-mosca-broker -p 1884:1884 zetta/zetta-mqtt-broker
docker run -d --name mqtt-target -p 8082:1337 zetta/zetta-mqtt-target
docker run -d --hostname my-rabbit --name some-rabbit -p 8080:15672 -p 5672:5672 rabbitmq:3-management


