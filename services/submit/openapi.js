/** OpenAPI 3.0 spec for Submit service – GET /docs */
module.exports = {
  openapi: '3.0.0',
  info: { title: 'Submit API', version: '1.0.0' },
  paths: {
    '/submit': {
      post: {
        summary: 'Submit a new joke',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['setup', 'punchline', 'type'],
                properties: {
                  setup: { type: 'string' },
                  punchline: { type: 'string' },
                  type: { type: 'string' }
                }
              }
            }
          }
        },
        responses: { 201: { description: 'Joke submitted' }, 400: { description: 'Bad request' } }
      }
    },
    '/types': {
      get: {
        summary: 'Get all joke types',
        responses: { 200: { description: 'List of type names' } }
      }
    }
  }
};
