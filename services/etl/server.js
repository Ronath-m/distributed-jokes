/**
 * ETL – Option 4: consume "moderated" queue only. Publish type_update when a new type is added.
 */

require('dotenv').config();
const amqp = require('amqplib');
const http = require('http');
const { initSchema, loadJoke } = require('./db');

const PORT = process.env.PORT || 3001;
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
const MODERATED_QUEUE = process.env.MODERATED_QUEUE || 'moderated';
const TYPE_UPDATE_EXCHANGE = process.env.TYPE_UPDATE_EXCHANGE || 'type_update';

async function runConsumer() {
  const conn = await amqp.connect(RABBITMQ_URL);
  const ch = await conn.createChannel();
  await ch.assertQueue(MODERATED_QUEUE, { durable: true });
  await ch.assertExchange(TYPE_UPDATE_EXCHANGE, 'fanout', { durable: true });
  ch.prefetch(1);

  ch.consume(MODERATED_QUEUE, async (msg) => {
    if (!msg) return;
    try {
      const payload = JSON.parse(msg.content.toString());
      const { setup, punchline, type } = payload;
      if (!setup || !punchline || !type) {
        ch.nack(msg, false, false);
        return;
      }
      const { wasNewType } = await loadJoke({ setup, punchline, type });
      console.log('Loaded joke into DB:', type);
      if (wasNewType) {
        ch.publish(TYPE_UPDATE_EXCHANGE, '', Buffer.from(JSON.stringify({ type: String(type).trim() })), { persistent: true });
        console.log('Published type_update:', type);
      }
      ch.ack(msg);
    } catch (err) {
      console.error('ETL process error:', err);
      ch.nack(msg, false, true);
    }
  }, { noAck: false });

  console.log('ETL consuming queue "' + MODERATED_QUEUE + '"');
}

const server = http.createServer((req, res) => {
  if (req.url === '/alive' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(PORT, '0.0.0.0', async () => {
  console.log('ETL listening on ' + PORT);
  try {
    await initSchema();
    await runConsumer();
  } catch (err) {
    console.error('Startup failed:', err);
    process.exit(1);
  }
});
