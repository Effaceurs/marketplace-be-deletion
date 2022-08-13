const keys = require('./config/keys');
const amqp = require('amqplib/callback_api');
const request = require('request');

async function checkStatus(message) {
  let id;
  let payload = {};
  payload.message = message;
  request.post(
    {
      url: keys.gitlaburl + keys.gitlabpipeline + keys.gitlabpipelinetoken,
      form: {
        variables: {
          NAME: message.body.name,
          ID: message.body.image + '-' + message.body._id,
          MODULE_NAME: message.body.image,
          REPLICAS: message.body.replicas,
          NAMESPACE: message.user,
          CUSTOMERNAME: message.user,
          VERSION: message.body.version,
          PROVIDER: message.body.provider,
          STATUS: message.body.status,
        },
      },
    },
    function (error, response, body) {
      id = JSON.parse(body).id;
      console.log('id - ', id);
    }
  );

  let success;
  let jobId;
  await new Promise((resolve) => setTimeout(resolve, 2000));
  request.get(
    {
      url: keys.gitlaburl + '/pipelines/' + id + '/jobs',
    },
    function (error, response, body) {
      const answer = JSON.parse(response.body);
      const deleteStage = answer.filter((stages) => stages.name === 'delete');
      jobId = deleteStage[0].id;
    }
  );
  await new Promise((resolve) => setTimeout(resolve, 2000));
  for (let i = 0; i <= 15; i++) {

    if (success === true || success === false) {
      console.log('job has been processed');
      break;
    }

    request.get(
      {
        url: keys.gitlaburl + '/jobs/' + jobId,
        headers: { 'PRIVATE-TOKEN': keys.gitlabtoken },
      },
      function (error, response, body) {
        let jobStatusAnswer = JSON.parse(response.body);
        console.log(`i - ${i} ; jobid - ${jobId} ; ${jobStatusAnswer.status}`)
        if (
          jobStatusAnswer.status === 'skipped' ||
          jobStatusAnswer.status === 'failed' || i == 15
        ) {
          success = false;
        }
        if (jobStatusAnswer.status === 'success') {
          success = true;
        }
      }
    );
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }
  console.log(`jobid - ${jobId} , ; status - ${success}`)
  if (success != true) {
    payload.message.body.status = 'failed';
    payload.artifact = '';
    console.log(payload);
    console.log('sending a message');
    sendMessage(payload);
    return;
  } else {
    payload.message.body.status = 'deleted';
    payload.artifact = '';
    console.log('sending a message');
    sendMessage(payload);
    return;
  }
}

function sendMessage(payload) {
  amqp.connect(keys.amq, function (error, connection) {
    if (error) {
      console.log(error);
      res.status(500).json('the message has not been sent');
    }
    connection.createChannel((error, channel) => {
      if (error) {
        console.log(error);
      }
      let queueName = 'applicationPutStatus';
      let message = { payload: payload };
      channel.assertQueue(queueName, {
        durable: false,
      });
      channel.sendToQueue(queueName, Buffer.from(JSON.stringify(message)));
      setTimeout(() => {
        connection.close();
      }, 1000);
    });
  });
}

amqp.connect(keys.amq, function (error0, connection) {
  if (error0) {
    throw error0;
  }
  connection.createChannel((error1, channel) => {
    if (error1) {
      throw error1;
    }
    let queueName = 'applicationDeletionRequest';
    channel.assertQueue(queueName, {
      durable: false,
    });
    channel.consume(queueName, (msg) => {
      console.log('MESSAGE HAS COME');
      const message = JSON.parse(msg.content.toString());
      checkStatus(message);
      console.log('MESSAGE PROCESSED');
      channel.ack(msg);
    });
  });
});
