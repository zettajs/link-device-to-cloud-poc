FROM node:4
MAINTAINER Apigee Link

ADD     . /broker
WORKDIR /broker
RUN     npm install

env     PORT 1883
EXPOSE  1883

CMD        ["server.js"]
ENTRYPOINT ["node"] 
