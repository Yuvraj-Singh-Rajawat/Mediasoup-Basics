const os = require("os"); //os module
const mediasoup = require("mediasoup");
const totalThreads = os.cpus().length; //number of cpu cores
// console.log(totalThreads)
const config = require("./config");

const createWorkers = async () =>
  new Promise(async (resolve, reject) => {
    let workers = [];

    // loop to create each worker
    for (let i = 0; i < totalThreads; i++) {
      const worker = await mediasoup.createWorker({
        // rtcmin and max are just arbitrary ports for traffic
        // useful for firewall or networking rules
        rtcMinPort: config.workerSettings.rtcMinPort,
        rtcMaxPort: config.workerSettings.rtcMaxPort,

        logLevel: config.workerSettings.logLevel,
        logTags: config.workerSettings.logTags,
      });
      worker.on("died", () => {
        // this should never happen, but if it does do x...
        console.log("mediasoup worker died");
        process.exit(1); // kill the node program
      });
      workers.push(worker);
    }

    resolve(workers);
  });

module.exports = createWorkers;
