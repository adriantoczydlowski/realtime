/// <reference path="typings/index.d.ts" />

import {Observable, Subject} from '@reactivex/rxjs';
import {Server} from 'ws';
import {createServer} from 'http';
import * as express from 'express';

import * as fs from 'fs';
var cors = require('cors');

var app = express();
app.use(cors());

let drgs = require('../data/drg.json');

const searchDrgs = query => {
  query.ms_drg = query.ms_drg ? parseInt(query.ms_drg) : undefined;
  query.mdc = query.mdc ? parseInt(query.mdc) : undefined;

  return (drg) => {
    //prefer ms_drg
    if(query.ms_drg){
      return drg.ms_drg === query.ms_drg;
    }
    return drg.mdc === query.mdc;
  }
}

app.get('/drgs', (req, res) => {
  if(!req.query.ms_drg && !req.query.mdc){
    return res.json([]);
  }
  res.json(drgs.filter(searchDrgs(req.query)));
});

var server = app.listen(3000, function () {
  var host = server.address().address;
  var port = server.address().port;

  console.log('Drg Server app listening at http://%s:%s', host, port);
});

//creates a new server socket Subject
const createRxSocket = (connection) => {
  console.info('createRxSocket...');
  let messages = Observable.fromEvent(connection, 'message', (message) => JSON.parse(message));
  let messageObserver:any = {
    next(message){
      if(connection.readyState === 1){
        connection.send(JSON.stringify(message));        
      }
     }
  };
  connection.on('close', () => {
    connection.streams && connection.streams.forEach(s => s.unsubscribe());
  });
  return Subject.create(messages, messageObserver);
}

//creates an instance of the websocket server;
const createRxServer = (options) => {
  return new Observable(serverObserver => {
    console.info('started server...');
    let wss = new Server(options);
    wss.on('connection', connection => serverObserver.next(connection));
    return () => {
      wss.close();
    }
  }).share();
}

const socketServer = createRxServer({port: 8081});
const connections = socketServer.map(createRxSocket);
console.log('asdasd')
let messageEvents$ = connections.flatMap(connection => connection.map(message => ({connection, message})));

let [subs, unsubs] = messageEvents$.partition(({message:{type}}:any) => type === 'sub');

subs.subscribe(({connection, message:{symbol}}:any) => {
  const source = Observable.interval(500).map(() => ({
    symbol,
    price: Math.random() * 100,
    timestamp: Date.now()
  }));
  connection.streams = connection.streams || {};
  connection.streams[symbol] = source.subscribe(connection);
});
  
unsubs.subscribe(({ connection, message:{symbol}}:any) => {
  connection.streams && connection.streams[symbol].unsubscribe();
});
