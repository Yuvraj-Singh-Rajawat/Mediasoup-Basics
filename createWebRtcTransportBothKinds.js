const createWebRtcTransportBothKinds = (router) => new Promise(async(resolve, reject) => {
  const transport = await router.createWebRtcTransport({
    enableUdp: true,
    enableTcp: true, // alaways use UDP unless we can't
    preferUdp: true,
    listenInfos: [
      {
        protocol: "udp",
        ip: "127.0.0.1",
        // announcedAddress: "localhost",
      },
      {
        protocol: "tcp",
        ip: "127.0.0.1",
        // announcedAddress: "localhost",
      },
    ],
  });

  const clientTransportParams = {
    id: transport.id,
    iceParameters: transport.iceParameters,
    iceCandidates: transport.iceCandidates,
    dtlsParameters: transport.dtlsParameters,
  };

  resolve({transport, clientTransportParams});
})

module.exports = createWebRtcTransportBothKinds;