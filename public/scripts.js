// Globals
let socket = null;
let device = null;
let localStream = null;
let producerTransport = null;
let producer = null;
let consumerTransport = null;
let consumer = null;

// connect to the server
const initConnect = () => {
  // console.log("init connect")
  socket = io("https://192.168.248.57:3030");
  connectButton.innerHTML = "Connecting...";
  connectButton.disabled = true;

  // keep the socket listeners in their own place
  addSocketListeners();
};

const deviceSetup = async () => {
  console.log(mediasoupClient);
  device = new mediasoupClient.Device();
  // now let's load the device
  const routerRtpCapabilities = await socket.emitWithAck("getRtcCap");
  // console.log(routerRtpCapabilities)
  await device.load({ routerRtpCapabilities });
  // console.log(device.loaded)

  deviceButton.disabled = true;
  createProdButton.disabled = false;
  createConsButton.disabled = false;
  disconnectButton.disabled = false;
};

const createProducer = async () => {
  //   console.log("create transport");
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });
    localVideo.srcObject = localStream;
  } catch (error) {
    console.log("GUM error", error);
  }

  // ask the socket.io server(signaling) for transport information
  const data = await socket.emitWithAck("create-producer-transport");
  console.log(data);

  const { id, iceParameters, iceCandidates, dtlsParameters } = data;

  // make a transport on the client (producer)
  const transport = await device.createSendTransport({
    id,
    iceParameters,
    iceCandidates,
    dtlsParameters,
  });
  producerTransport = transport;

  // the transport connect event will NOT fire until we call transport.producer()
  producerTransport.on(
    "connect",
    async ({ dtlsParameters }, callback, errback) => {
      //   console.log("Transport connect event has fired!");
      // connect comes with local dtlsParameters. We need to send these up to the server, so we can finish the connection

      console.log(dtlsParameters);
      const resp = await socket.emitWithAck("connect-transport", {
        dtlsParameters,
      });
      if (resp === "success") {
        // callign callback simply lets the app know, the server succeded in connecting, so trigger the produce event
        callback();
      } else if (resp === "error") {
        // callign callback simply lets the app know, the server failed in connecting, so hault  evenything
        errback();
      }
    }
  );

  producerTransport.on("produce", async (parameters, callback, errback) => {
    // console.log("Transport produce event has fired!");
    console.log(parameters);

    const { kind, rtpParameters } = parameters;

    const resp = await socket.emitWithAck("start-producing", {
      kind,
      rtpParameters,
    });

    if (resp === "error") {
      // something went wrong
      errback();
    } else {
      callback({ id: resp });
    }

    publishButton.disabled = true;
    createConsButton.disabled = false;
  });

  createProdButton.disabled = true;
  publishButton.disabled = false;
};

const publish = async () => {
  console.log("publish");

  const track = await localStream.getVideoTracks()[0];

  // call producerTransport -> connect
  producer = await producerTransport.produce({ track });
};

const createConsumer = async () => {
  // ask the socket.io server(signaling) for transport information
  const data = await socket.emitWithAck("create-consumer-transport");
  // console.log(data);

  const { id, iceParameters, iceCandidates, dtlsParameters } = data;

  // make a transport on the client (producer)
  const transport = await device.createRecvTransport({
    id,
    iceParameters,
    iceCandidates,
    dtlsParameters,
  });
  consumerTransport = transport;

  // the transport connect event will NOT fire until we call transport.consume()
  consumerTransport.on(
    "connect",
    async ({ dtlsParameters }, callback, errback) => {
      //   console.log("Transport connect event has fired!");
      // connect comes with local dtlsParameters. We need to send these up to the server, so we can finish the connection

      // console.log(dtlsParameters);
      const resp = await socket.emitWithAck("connect-consuemr-transport", {
        dtlsParameters,
      });
      if (resp === "success") {
        // callign callback simply lets the app know, the server succeded in connecting, so trigger the produce event
        callback();
      } else if (resp === "error") {
        // callign callback simply lets the app know, the server failed in connecting, so hault  evenything
        errback();
      }

      console.log(resp);
    }
  );

  console.log("consumer transport created");
  createConsButton.disabled = true;
  consumeButton.disabled = false;
};

const consume = async () => {

  console.log("coming line 163")
  // emit consume-media event. This will get us back the stuff that we need to make ac consumer, and get the video client
  const consumerParams = await socket.emitWithAck("consume-media", {rtpCapabilities: device.rtpCapabilities})
  console.log("coming line 166")

  console.log(consumerParams)
  if(consumerParams === "noProducer"){
    console.log("There is no producer set up to consume")
  }
  else if(consumerParams === "cannotConsume"){
    console.log("rtpCapabilities failed. Cannot consume");
  }
  else{
    // set up the consumer! and add the video to the video tag
    
    consumer = await consumerTransport.consume(consumerParams)
    const {track} = consumer;
    console.log(track)

    // refer to mdn to know more about mediastream
    remoteVideo.srcObject = new MediaStream([track]);

    console.log("Track is ready .. we need to unpause")
    await socket.emitWithAck('unpauseConsumer');

    consumeButton.disabled = true
    disconnectButton.disabled = false
  }
};

const disconnect = async () => {
  //  we want to close eveything. Right now. :)

  // send the message to the server, then close here
  const closeResp = await socket.emitWithAck("close-all");

  if(closeResp === "closeError"){
    console.log("Something happened on the Server...")
  }
  // it doesn't matter if the server didn't close, we are closing.
  // now
  producerTransport?.close()
  consumerTransport?.close()

  connectButton.disabled = false
}

// socket listeners here!
function addSocketListeners() {
  socket.on("connect", () => {
    // this will auto trigger, once we are connected
    connectButton.innerHTML = "Connected";
    deviceButton.disabled = false;
  });
}
