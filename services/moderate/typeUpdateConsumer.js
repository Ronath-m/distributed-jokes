/**
 * Subscribe to type_update exchange; update types file when ETL adds a new type.
 */

const amqp = require('amqplib');
const { addType } = require('./typesCache');

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
const TYPE_UPDATE_EXCHANGE = process.env.TYPE_UPDATE_EXCHANGE || 'type_update';
const MOD_TYPE_UPDATE_QUEUE = process.env.MOD_TYPE_UPDATE_QUEUE || 'mod_type_update';

async function startTypeUpdateConsumer() {
  const conn = await amqp.connect(RABBITMQ_URL);
  const ch = await conn.createChannel();
  await ch.assertExchange(TYPE_UPDATE_EXCHANGE, 'fanout', { durable: true });
  await ch.assertQueue(MOD_TYPE_UPDATE_QUEUE, { durable: true });
  await ch.bindQueue(MOD_TYPE_UPDATE_QUEUE, TYPE_UPDATE_EXCHANGE, '');
  ch.consume(MOD_TYPE_UPDATE_QUEUE, async (msg) => {
    if (!msg) return;
    try {
      const payload = JSON.parse(msg.content.toString());
      const typeName = payload.type || payload;
      await addType(typeName);
      ch.ack(msg);
    } catch (e) {
      ch.nack(msg, false, true);
    }
  }, { noAck: false });
  console.log('Moderate subscribed to type_update');
}

module.exports = { startTypeUpdateConsumer };
