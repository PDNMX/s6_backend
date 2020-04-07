FROM node:12-alpine

MAINTAINER Mergio Rodríguez <sergio.rdzsg@gmail.com>

ADD . /pdn_s6_backend
WORKDIR /pdn_s6_backend

RUN yarn add global yarn \
&& yarn install \
&& yarn cache clean

EXPOSE ${PORT}

CMD ["yarn", "start"]
