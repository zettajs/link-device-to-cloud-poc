#!/bin/bash

set -e

#source /etc/environment
echo "Broker for ${COREOS_PRIVATE_IPV4}"

DIRS=(broker credential-server target)
for i in ${DIRS[@]}; do
    cd ${i}
    ./build.sh
    cd ..
done

                      

