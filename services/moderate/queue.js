/**
 * Option 4: get one message from submit queue (for GET /moderate); publish to moderated queue (for POST /moderated).
 */

const amqp = require('amqplib');

let channel = null;
let connection = null;
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
const SUBMIT_QUEUE = process.env.SUBMIT_QUEUE || 'submit';
const MODERATED_QUEUE = process.env.MODERATED_QUEUE || 'moderated';

async function getChannel() {
  if (channel) return channel;
  connection = await amqp.connect(RABBITMQ_URL);
  channel = await connection.createChannel();
  await channel.assertQueue(SUBMIT_QUEUE, { durable: true });
  await channel.assertQueue(MODERATED_QUEUE, { durable: true });
  return channel;
}

/** Get one message from submit queue if available. Acks it (takes it off the queue). */
async function getOneFromSubmit() {
  const ch = await getChannel();
  const msg = await ch.get(SUBMIT_QUEUE, { noAck: false });
  if (!msg) return null;
  try {
    const payload = JSON.parse(msg.content.toString());
    ch.ack(msg);
    return payload;
  } catch (e) {
    ch.nack(msg, false, false);
    return null;
  }
}

/** Publish moderated joke to moderated queue. */
async function publishModerated(payload) {
  const ch = await getChannel();
  const ok = ch.sendToQueue(MODERATED_QUEUE, Buffer.from(JSON.stringify(payload)), { persistent: true });
  if (!ok) throw new Error('Moderated queue full');
}

module.exports = { getChannel, getOneFromSubmit, publishModerated };
