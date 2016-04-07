#!/bin/sh

docker kill cred-server mqtt-mosca-external-broker mqtt-mosca-internal-broker mqtt-target some-rabbit 
docker rm cred-server mqtt-mosca-external-broker mqtt-mosca-internal-broker mqtt-target some-rabbit
