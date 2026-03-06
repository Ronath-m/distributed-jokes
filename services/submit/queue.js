/**
 * Publish submitted joke to RabbitMQ "submit" queue (Option 2+).
 * Queue is durable so messages survive broker restart.
 */

const amqp = require('amqplib');

let channel = null;
let connection = null;
const QUEUE = process.env.SUBMIT_QUEUE || 'submit';

async function getChannel() {
  if (channel) return channel;
  const url = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
  connection = await amqp.connect(url);
  channel = await connection.createChannel();
  await channel.assertQueue(QUEUE, { durable: true });
  return channel;
}

async function publishSubmit(payload) {
  const ch = await getChannel();
  const ok = ch.sendToQueue(QUEUE, Buffer.from(JSON.stringify(payload)), {
    persistent: true,
  });
  if (!ok) throw new Error('Queue full or unavailable');
}

module.exports = { publishSubmit, getChannel };
