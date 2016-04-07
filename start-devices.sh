#!/bin/bash

set -e

BROKER_URL=${BROKER_URL:-mqtt://localhost:1883}
CREDENTIAL_API=${CREDENTIAL_API:-http://localhost:1338}

if [[ "$1" != "" ]]; then
    CLIENTS="$1"
else
    CLIENTS=1
fi

startChild() {
   BROKER_URL=$BROKER_URL node client/example_device_subscriptions.js $1 $2 &
}

COUNTER=0
while [  $COUNTER -lt $CLIENTS ]; do    
    data=$(curl -s -H "Content-Type:application/json" --data '{"name": "somedevice" }' $CREDENTIAL_API)
    username=$(echo $data | jq -r '.properties.username')
    password=$(echo $data | jq -r '.properties.password')
    startChild $username $password
    let COUNTER=COUNTER+1
done

wait
