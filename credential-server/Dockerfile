FROM node:4
MAINTAINER Apigee Link

ADD     . /broker
WORKDIR /broker
RUN     npm install

env     PORT 1338
EXPOSE  1338

CMD        ["server.js"]
ENTRYPOINT ["node"] 
