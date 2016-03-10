#!/bin/sh

docker kill cred-server mqtt-mosca-broker mqtt-target some-rabbit 
docker rm cred-server mqtt-mosca-broker mqtt-target some-rabbit
