FROM node:4
MAINTAINER Apigee Link

ADD     . /broker
WORKDIR /broker
RUN     npm install

env     PORT 2883
EXPOSE  2883

CMD        ["server.js"]
ENTRYPOINT ["node"] 
