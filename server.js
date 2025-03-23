const fs = require("fs"); // we need this to read our keys. Part of node
const https = require("https"); //we need this for a secure express server.

//express sets the http server and serves our frotned
const express = require("express");
const app = express();

// server everytbhin in publc statically
app.use(express.static("public"));

// get the keys we made with mkcert
const key = fs.readFileSync("./config/cert.key");
const cert = fs.readFileSync("./config/cert.crt");
const options = { key, cert };

// use those keys for creating secure server (https)
const httpsServer = https.createServer(options, app);

const socketio = require("socket.io");
const mediasoup = require("mediasoup");

const config = require("./config/config");
const createWorkers = require("./createWorkers");
const { ListenInfo } = require("mediasoup/node/lib/fbs/transport/listen-info");
const createWebRtcTransportBothKinds = require("./createWebRtcTransportBothKinds");

// setup the socketio server, listening by way of our express http
const io = socketio(httpsServer, {
  cors: [`https://192.168.248.57:${config.port}`],
});

// init workers, its where ou mediasoup workers will live
let workers = null;
// init router, it's where our 1 router will live
let router = null;
// theProducer will be a global, and whoever produced lst
let theProducer = null;

// initMediaSoup get mediasoup ready to do its thing
const initMediaSoup = async () => {
  workers = await createWorkers();

  router = await workers[0].createRouter({
    mediaCodecs: config.routerMediaCodecs,
  });
};

initMediaSoup(); // build our mediasoup server/sfu

// socketio  listenders
io.on("connect", (socket) => {
  let thisClientProducerTransport = null;
  let thisClientProducer = null;
  let thisClientConsumerTransport = null;
  let thisClientConsumer = null;

  // socket is the client that just connected
  socket.on("getRtcCap", (ack) => {
    // cb is a callback to run, that will send the args back to the client
    ack(router.rtpCapabilities);
  });

  socket.on("create-producer-transport", async (ack) => {
    // create a transport specifically a producer
    const { transport, clientTransportParams } =
      await createWebRtcTransportBothKinds(router);
    thisClientProducerTransport = transport;
    ack(clientTransportParams);
  });

  socket.on("connect-transport", async (dtlsParameters, ack) => {
    try {
      await thisClientProducerTransport.connect(dtlsParameters);
      ack("success");
    } catch (error) {
      // something went wrong. Log it, and send back "err"
      console.log(error);
      ack("error");
    }
    ack();
  });

  socket.on("start-producing", async ({ kind, rtpParameters }, ack) => {
    try {
      thisClientProducer = await thisClientProducerTransport.produce({
        kind,
        rtpParameters,
      });

      thisClientProducer.on("transportclose", () => {
        console.log("Producer transport closed. Just telling");
        thisClientProducer.close();
      })

      theProducer = thisClientProducer;

      ack(thisClientProducer.id);
    } catch (error) {
      console.log(error);
      ack("error");
    }
  });

  socket.on("create-consumer-transport", async (ack) => {
    // create a transport specifically a producer
    const { transport, clientTransportParams } =
      await createWebRtcTransportBothKinds(router);
    thisClientConsumerTransport = transport;
    ack(clientTransportParams);
  });

  socket.on("connect-consuemr-transport", async (dtlsParameters, ack) => {
    try {
      await thisClientConsumerTransport.connect(dtlsParameters);
      ack("success");
    } catch (error) {
      // something went wrong. Log it, and send back "err"
      console.log(error);
      ack("error");
    }
    ack();
  });

  socket.on("consume-media", async ({ rtpCapabilities }, ack) => {
    // we will set up our clientconsumer, and send back the params the client needs to do the same

    // make sure there is a producer :) we can't consume without one producer

    console.log(rtpCapabilities);
    console.log(thisClientProducer);
    try {
      if (!theProducer) {
        ack("noProducer");
      } else if (
        !router.canConsume({
          producerId: theProducer.id,
          rtpCapabilities,
        })
      ) {
        ack("cannotConsume");
      } else {
        // we can consume .. there is a producer and client is able to proceed.
        thisClientConsumer = await thisClientConsumerTransport.consume({
          producerId: theProducer.id,
          rtpCapabilities,
          paused: true, // see docs, this is usually the best way to start
        });

        thisClientConsumer.on("transportclose", () => {
          console.log("consumer transport closed. Just telling");
          thisClientConsumer.close();
        })

        console.log(thisClientConsumer);
        const consumerParams = {
          producerId: theProducer.id,
          id: thisClientConsumer.id,
          kind: thisClientConsumer.kind,
          rtpParameters: thisClientConsumer.rtpParameters,
        };

        ack(consumerParams);
      }
    } catch (error) {
      console.log("consume-media error", error);
    }
  });

  socket.on("unpauseConsumer", async () => {
    await thisClientConsumer.resume();
  });

  socket.on("close-all", (ack) => {
    //  client has requested to close All

    try {
      thisClientConsumerTransport?.close();
      thisClientProducerTransport?.close();
      ack("closed")
    } catch (error) {
      ack("closeError")
    }
  })
});

httpsServer.listen(config.port, () => {
  console.log("listening on port 3030");
});
